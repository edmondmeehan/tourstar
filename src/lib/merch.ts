// TourStar merch: real products from the TourStar Shopify store (print-on-demand), shown in the game.
// Checkout happens on Shopify (physical goods can't use in-app purchase). When an order is paid, the
// shopify-webhook function unlocks the matching in-game items on the buyer's account.
import { create } from "zustand";
import { supabase, useCloud } from "./cloud";
import { openTickets } from "./presales";
import type { DropItem } from "../game/cosmetics";

export interface MerchVariant { id: string; title: string; availableForSale: boolean; price: { amount: string; currencyCode: string } }
export interface MerchProduct {
  id: string; numericId: string; handle: string; title: string; description: string;
  image: string | null; price: { amount: string; currencyCode: string }; variants: MerchVariant[];
}
export interface MerchConfig { enabled: boolean; domain: string; token: string; collection: string; version: string }

export const useMerch = create<{ cfg: MerchConfig | null; products: MerchProduct[] | null; unlocks: Record<string, DropItem[]>; error: string | null }>(() => ({ cfg: null, products: null, unlocks: {}, error: null }));

export const money = (p: { amount: string; currencyCode: string }) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: p.currencyCode || "USD" }).format(Number(p.amount));
const numeric = (gid: string) => gid.split("/").pop() ?? gid;

export async function loadMerchConfig(): Promise<MerchConfig | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("app_public_config").select("key, value").in("key", ["merch_enabled", "merch_shop_domain", "merch_collection", "merch_api_version", "shopify_storefront_token"]);
  const m = Object.fromEntries((data ?? []).map((r) => [r.key, String(r.value ?? "").trim()]));
  const cfg: MerchConfig = {
    enabled: m.merch_enabled === "true",
    domain: (m.merch_shop_domain || "").replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
    token: m.shopify_storefront_token || "",
    collection: m.merch_collection || "",
    version: m.merch_api_version || "2026-07",
  };
  useMerch.setState({ cfg });
  return cfg;
}

async function storefront<T>(cfg: MerchConfig, query: string, variables: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://${cfg.domain}/api/${cfg.version}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": cfg.token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await r.json().catch(() => ({})) as { data?: T; errors?: { message: string }[] };
  if (!r.ok || body.errors?.length) throw new Error(body.errors?.[0]?.message ?? `Shopify ${r.status}`);
  return body.data as T;
}

const PRODUCT_FIELDS = `id handle title description featuredImage { url } priceRange { minVariantPrice { amount currencyCode } }
  variants(first: 30) { nodes { id title availableForSale price { amount currencyCode } } }`;
type RawProduct = { id: string; handle: string; title: string; description: string; featuredImage: { url: string } | null; priceRange: { minVariantPrice: { amount: string; currencyCode: string } }; variants: { nodes: MerchVariant[] } };

/** Products from the store (or from one collection, if set in Admin → Merch). */
export async function loadProducts(cfgIn?: MerchConfig | null): Promise<MerchProduct[]> {
  const cfg = cfgIn ?? (await loadMerchConfig());
  if (!cfg?.domain || !cfg.token) { useMerch.setState({ products: [], error: "not-connected" }); return []; }
  try {
    const raw = cfg.collection
      ? (await storefront<{ collection: { products: { nodes: RawProduct[] } } | null }>(cfg, `query($h: String!) { collection(handle: $h) { products(first: 50) { nodes { ${PRODUCT_FIELDS} } } } }`, { h: cfg.collection })).collection?.products.nodes ?? []
      : (await storefront<{ products: { nodes: RawProduct[] } }>(cfg, `query { products(first: 50, sortKey: BEST_SELLING) { nodes { ${PRODUCT_FIELDS} } } }`, {})).products.nodes;
    const products = raw.map((p) => ({
      id: p.id, numericId: numeric(p.id), handle: p.handle, title: p.title, description: p.description,
      image: p.featuredImage?.url ?? null, price: p.priceRange.minVariantPrice, variants: p.variants.nodes,
    }));
    const { data: u } = await supabase!.from("merch_unlocks").select("product_id, items");
    useMerch.setState({ products, unlocks: Object.fromEntries((u ?? []).map((r) => [r.product_id, r.items as DropItem[]])), error: null });
    return products;
  } catch (e) {
    useMerch.setState({ products: [], error: (e as Error).message });
    return [];
  }
}

/** VIP members get a discount code, applied automatically at checkout. */
export async function vipCode(): Promise<string | null> {
  if (!supabase || !useCloud.getState().session) return null;
  const { data } = await supabase.rpc("my_merch_vip_code");
  return (data as string | null) || null;
}

/** Start a Shopify checkout for one item and open it. The order carries the player's id so the unlock lands on their account. */
export async function buyMerch(variantId: string, qty = 1): Promise<{ ok: boolean; message: string }> {
  const cfg = useMerch.getState().cfg ?? (await loadMerchConfig());
  if (!cfg?.domain || !cfg.token) return { ok: false, message: "The merch store isn't open yet." };
  const session = useCloud.getState().session;
  const code = await vipCode();
  const input: Record<string, unknown> = {
    lines: [{ merchandiseId: variantId, quantity: qty }],
    attributes: session ? [{ key: "tourstar_user", value: session.user.id }] : [],
    ...(code ? { discountCodes: [code] } : {}),
    ...(session?.user.email ? { buyerIdentity: { email: session.user.email } } : {}),
  };
  try {
    const d = await storefront<{ cartCreate: { cart: { checkoutUrl: string } | null; userErrors: { message: string }[] } }>(cfg,
      `mutation($input: CartInput!) { cartCreate(input: $input) { cart { checkoutUrl } userErrors { message } } }`, { input });
    const url = d.cartCreate.cart?.checkoutUrl;
    if (!url) return { ok: false, message: d.cartCreate.userErrors[0]?.message ?? "Couldn't start checkout." };
    await openTickets(url);
    return { ok: true, message: code ? "Checkout opened with your VIP discount." : "Checkout opened." };
  } catch (e) {
    return { ok: false, message: `Couldn't start checkout: ${(e as Error).message}` };
  }
}
