// Real in-app purchases via RevenueCat (App Store / Google Play).
// Product IDs live in App Store Connect / Play Console; RevenueCat "entitlements" unlock the
// permanent perks. Cash packs are consumables granted once per transaction.
// On the web (and in builds without a RevenueCat key) purchases are unavailable.
import { cashPackAmount } from "../game/economy";
import { create } from "zustand";
import { Purchases, PRODUCT_CATEGORY, type CustomerInfo, type PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";
import { PAYWALL_RESULT, RevenueCatUI } from "@revenuecat/purchases-capacitor-ui";
import { Capacitor } from "@capacitor/core";
import { gameStorage, isNative } from "./native";
import { PREMIUM_SKUS, useMembership, type Sku } from "../game/settings";
import { useGame } from "../game/store";
import { supabase, useCloud } from "./cloud";
import { refreshPerks } from "./ai";
import { refreshGold } from "./gold";

const IS_ANDROID = Capacitor.getPlatform() === "android";
/** A key baked into the build wins; otherwise the one saved in Admin → Integrations is used. */
const ENV_KEY = (IS_ANDROID ? import.meta.env.VITE_REVENUECAT_ANDROID_KEY : import.meta.env.VITE_REVENUECAT_IOS_KEY) as string | undefined;
const CONFIG_KEY = IS_ANDROID ? "revenuecat_android_public" : "revenuecat_ios_public";
const CACHE = `tourstar-${CONFIG_KEY}`;

/** Find the RevenueCat key: build env → Admin setting (cached for offline launches). */
async function resolveKey(): Promise<string | null> {
  if (ENV_KEY) return ENV_KEY;
  const cached = await Promise.resolve(gameStorage.getItem(CACHE)).catch(() => null);
  try {
    if (supabase) {
      const { data } = await supabase.from("app_public_config").select("value").eq("key", CONFIG_KEY).maybeSingle();
      const v = (data?.value as string | undefined)?.trim();
      if (v) { void gameStorage.setItem(CACHE, v); return v; }
      if (data === null) void gameStorage.removeItem(CACHE);
    }
  } catch { /* offline: fall back to cache */ }
  return cached || null;
}
let KEY: string | null = ENV_KEY ?? null;

/** Store product IDs: co.please.tourstar.<sku> (create these exactly in App Store Connect / Play Console). */
export const productId = (sku: Sku) => `co.please.tourstar.${sku}`;
/** RevenueCat entitlement "vip" is attached to both VIP subscriptions. */
const ENTITLEMENT: Partial<Record<Sku, "vip">> = { vip_monthly: "vip", vip_yearly: "vip" };
const AI_PACK: Partial<Record<Sku, number>> = { ai_songs_5: 5, ai_songs_15: 15 };
const GOLD_PACK: Partial<Record<Sku, number>> = { gold_100: 100, gold_550: 550, gold_1200: 1200, gold_2500: 2500 };
const CASH: Partial<Record<Sku, true>> = { cash_small: true, cash_large: true };

export type StoreStatus = "unavailable" | "loading" | "ready" | "error";
export const usePurchases = create<{ status: StoreStatus; products: Partial<Record<Sku, PurchasesStoreProduct>>; error: string | null }>(() => ({
  status: isNative ? "loading" : "unavailable",
  products: {},
  error: null,
}));

export const purchasesAvailable = () => isNative && usePurchases.getState().status !== "unavailable";

function applyEntitlements(info: CustomerInfo) {
  const vip = !!info.entitlements.active.vip;
  useMembership.setState({ removeTimers: vip, premiumPass: vip, vipBadge: vip });
}

let started = false;
export async function startPurchases() {
  if (started || !isNative) return;
  started = true;
  KEY = await resolveKey();
  if (!KEY) { usePurchases.setState({ status: "unavailable" }); return; }
  try {
    await Purchases.configure({ apiKey: KEY!, appUserID: useCloud.getState().session?.user.id ?? undefined });
    await Purchases.addCustomerInfoUpdateListener(applyEntitlements);
    const ids = (kind: "sub" | "consumable") => PREMIUM_SKUS.filter((p) => p.kind === kind).map((p) => productId(p.sku));
    const [{ customerInfo }, subs, packs] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getProducts({ productIdentifiers: ids("sub"), type: PRODUCT_CATEGORY.SUBSCRIPTION }),
      Purchases.getProducts({ productIdentifiers: ids("consumable"), type: PRODUCT_CATEGORY.NON_SUBSCRIPTION }),
    ]);
    applyEntitlements(customerInfo);
    const map: Partial<Record<Sku, PurchasesStoreProduct>> = {};
    for (const p of [...subs.products, ...packs.products]) {
      const sku = PREMIUM_SKUS.find((s) => productId(s.sku) === p.identifier)?.sku;
      if (sku) map[sku] = p;
    }
    usePurchases.setState({ status: "ready", products: map });
  } catch (e) {
    usePurchases.setState({ status: "error", error: (e as Error).message });
  }
  // Tie purchases to the TourStar account so they follow the player to new devices.
  useCloud.subscribe((s, prev) => {
    const id = s.session?.user.id, was = prev.session?.user.id;
    if (id && id !== was) void Purchases.logIn({ appUserID: id }).then(({ customerInfo }) => applyEntitlements(customerInfo)).catch(() => {});
    if (!id && was) void Purchases.logOut().catch(() => {});
  });
}

export async function buy(sku: Sku): Promise<{ ok: boolean; message: string; cancelled?: boolean }> {
  const def = PREMIUM_SKUS.find((p) => p.sku === sku)!;
  const product = usePurchases.getState().products[sku];
  if (!product) return { ok: false, message: "This item isn't available right now. Try again later." };
  try {
    const res = await Purchases.purchaseStoreProduct({ product });
    applyEntitlements(res.customerInfo);
    const txn = res.transaction?.transactionIdentifier ?? `${Date.now()}`;
    const m = useMembership.getState();
    if (!m.purchases.some((p) => p.id === txn)) {
      // Record the receipt locally (shown in Account) and grant consumables exactly once.
      useMembership.setState({ purchases: [{ id: txn, sku, name: def.name, price: product.price, at: Date.now(), simulated: false }, ...m.purchases] });
      if (CASH[sku]) { const g = useGame.getState(); const amt = cashPackAmount(sku as "cash_small" | "cash_large", g.career); g.grantCash(amt, `Bought ${def.name} (${amt.toLocaleString()}).`); }
    }
    // AI credits and VIP status are added on the server (RevenueCat webhook); refresh them shortly.
    if (AI_PACK[sku] || ENTITLEMENT[sku]) for (const ms of [3000, 10000]) window.setTimeout(() => void refreshPerks(), ms);
    if (GOLD_PACK[sku] || ENTITLEMENT[sku]) for (const ms of [3000, 10000, 30000]) window.setTimeout(() => void refreshGold(), ms);
    if (GOLD_PACK[sku]) return { ok: true, message: `💿 ${GOLD_PACK[sku]!.toLocaleString()} Gold Records are on the way to your account. Thank you!` };
    if (AI_PACK[sku]) return { ok: true, message: `${def.emoji} ${AI_PACK[sku]} AI songs added to your studio. Thank you!` };
    if (ENTITLEMENT[sku]) return { ok: true, message: "👑 Welcome to TourStar VIP. Your perks are on." };
    return { ok: true, message: `${def.emoji} ${def.name} added. Thank you!` };
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err.userCancelled) return { ok: false, cancelled: true, message: "Purchase cancelled." };
    return { ok: false, message: err.message || "The purchase didn't go through." };
  }
}

export async function restore(): Promise<{ ok: boolean; message: string }> {
  if (!purchasesAvailable()) return { ok: false, message: "Purchases are available in the TourStar app." };
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    applyEntitlements(customerInfo);
    const n = Object.keys(customerInfo.entitlements.active).length;
    return { ok: true, message: n ? `Restored ${n} purchase${n > 1 ? "s" : ""}.` : "No previous purchases found for this Apple/Google account." };
  } catch (e) {
    return { ok: false, message: (e as Error).message || "Couldn't restore purchases." };
  }
}

/**
 * RevenueCat Paywall: the VIP plans screen designed in the RevenueCat dashboard (Paywalls), built from
 * the current Offering. Returns "unavailable" when no paywall is set up, so the game can fall back
 * to its own VIP buttons.
 */
export async function showVipPaywall(): Promise<{ ok: boolean; message: string; result: "purchased" | "restored" | "cancelled" | "unavailable" | "error" }> {
  if (!purchasesAvailable() || usePurchases.getState().status !== "ready") return { ok: false, result: "unavailable", message: "" };
  try {
    const offerings = await Purchases.getOfferings();
    // Only show the paywall when it sells TourStar's own VIP products (not RevenueCat's sample ones).
    const vipIds = [productId("vip_monthly"), productId("vip_yearly")];
    const pkgs = offerings.current?.availablePackages ?? [];
    if (!offerings.current || !pkgs.length || !pkgs.every((p) => vipIds.includes(p.product.identifier))) return { ok: false, result: "unavailable", message: "" };
    const { result } = await RevenueCatUI.presentPaywall({ offering: offerings.current, displayCloseButton: true });
    if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
      const { customerInfo } = await Purchases.getCustomerInfo();
      applyEntitlements(customerInfo);
      // VIP's Gold and AI allowance are added on the server by the RevenueCat webhook.
      for (const ms of [3000, 10000, 30000]) window.setTimeout(() => { void refreshPerks(); void refreshGold(); }, ms);
      const vip = !!customerInfo.entitlements.active.vip;
      return result === PAYWALL_RESULT.PURCHASED
        ? { ok: true, result: "purchased", message: "👑 Welcome to TourStar VIP. Your perks are on." }
        : { ok: vip, result: "restored", message: vip ? "👑 VIP restored. Your perks are on." : "No VIP subscription found for this Apple ID." };
    }
    if (result === PAYWALL_RESULT.ERROR) return { ok: false, result: "error", message: "The purchase didn't go through. Try again in a moment." };
    return { ok: false, result: "cancelled", message: "" };
  } catch (e) {
    return { ok: false, result: "unavailable", message: (e as Error).message || "" };
  }
}

/**
 * RevenueCat Customer Center: manage, cancel or get help with a VIP subscription without leaving the app.
 * Falls back to Apple's subscriptions page if it can't open.
 */
export async function manageSubscription() {
  try {
    if (purchasesAvailable()) {
      await RevenueCatUI.presentCustomerCenter();
      const { customerInfo } = await Purchases.getCustomerInfo();
      applyEntitlements(customerInfo);
      return;
    }
  } catch { /* fall through */ }
  window.open(IS_ANDROID ? "https://play.google.com/store/account/subscriptions" : "https://apps.apple.com/account/subscriptions", "_blank");
}

export const isEntitlementSku = (sku: Sku) => !!ENTITLEMENT[sku];
export const aiPackSize = (sku: Sku) => AI_PACK[sku] ?? 0;
/** Purchases that are credited to the player's account on the server (need sign-in). */
export const needsAccount = (sku: Sku) => !!AI_PACK[sku] || !!GOLD_PACK[sku];
