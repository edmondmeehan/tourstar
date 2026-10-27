// Real in-app purchases via RevenueCat (App Store / Google Play).
// Product IDs live in App Store Connect / Play Console; RevenueCat "entitlements" unlock the
// permanent perks. Cash packs are consumables granted once per transaction.
// On the web (and in builds without a RevenueCat key) purchases are unavailable.
import { create } from "zustand";
import { Purchases, PRODUCT_CATEGORY, type CustomerInfo, type PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { isNative } from "./native";
import { PREMIUM_SKUS, useMembership, type Sku } from "../game/settings";
import { useGame } from "../game/store";
import { useCloud } from "./cloud";

const KEY = Capacitor.getPlatform() === "android"
  ? (import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined)
  : (import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined);

/** Store product IDs: co.please.tourstar.<sku> (create these exactly in App Store Connect / Play Console). */
export const productId = (sku: Sku) => `co.please.tourstar.${sku}`;
/** RevenueCat entitlement IDs for the permanent unlocks. */
const ENTITLEMENT: Partial<Record<Sku, "remove_timers" | "premium_pass" | "vip_badge">> = {
  remove_timers: "remove_timers", premium_pass: "premium_pass", vip_badge: "vip_badge",
};
const CASH: Partial<Record<Sku, number>> = { cash_small: 100_000, cash_large: 1_000_000 };

export type StoreStatus = "unavailable" | "loading" | "ready" | "error";
export const usePurchases = create<{ status: StoreStatus; products: Partial<Record<Sku, PurchasesStoreProduct>>; error: string | null }>(() => ({
  status: isNative && KEY ? "loading" : "unavailable",
  products: {},
  error: null,
}));

export const purchasesAvailable = () => isNative && !!KEY;

function applyEntitlements(info: CustomerInfo) {
  const active = info.entitlements.active;
  useMembership.setState({
    removeTimers: !!active.remove_timers,
    premiumPass: !!active.premium_pass,
    vipBadge: !!active.vip_badge,
  });
}

let started = false;
export async function startPurchases() {
  if (started || !purchasesAvailable()) return;
  started = true;
  try {
    await Purchases.configure({ apiKey: KEY!, appUserID: useCloud.getState().session?.user.id ?? undefined });
    await Purchases.addCustomerInfoUpdateListener(applyEntitlements);
    const [{ customerInfo }, { products }] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getProducts({ productIdentifiers: PREMIUM_SKUS.map((p) => productId(p.sku)), type: PRODUCT_CATEGORY.NON_SUBSCRIPTION }),
    ]);
    applyEntitlements(customerInfo);
    const map: Partial<Record<Sku, PurchasesStoreProduct>> = {};
    for (const p of products) {
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
      const cash = CASH[sku];
      if (cash) useGame.getState().grantCash(cash, `Bought ${def.name}.`);
    }
    return { ok: true, message: `${def.emoji} ${def.name} unlocked. Thank you!` };
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

export const isEntitlementSku = (sku: Sku) => !!ENTITLEMENT[sku];
