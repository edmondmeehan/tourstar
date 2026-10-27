import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { gameStorage } from "../lib/native";
import type { Membership, Purchase, Settings } from "./types";

interface SettingsState extends Settings {
  set: (s: Partial<Settings>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 0.7,
      muted: false,
      vibration: "med",
      set: (s) => set(s),
    }),
    { name: "tourstar-settings", storage: createJSONStorage(() => gameStorage) },
  ),
);

export const PREMIUM_SKUS = [
  { sku: "remove_timers", name: "Remove Timers", price: 4.99, emoji: "⏱️", blurb: "Energy refills 2× faster and lockouts are cut in half." },
  { sku: "premium_pass", name: "Premium Pass", price: 9.99, emoji: "🎫", blurb: "+50% daily rewards and a gold name on the charts." },
  { sku: "vip_badge", name: "VIP Badge", price: 1.99, emoji: "💎", blurb: "Flex a VIP badge next to your name." },
  { sku: "cash_small", name: "Cash Pack — $100K", price: 2.99, emoji: "💵", blurb: "$100,000 in game cash." },
  { sku: "cash_large", name: "Cash Pack — $1M", price: 9.99, emoji: "💰", blurb: "$1,000,000 in game cash." },
] as const;

export type Sku = (typeof PREMIUM_SKUS)[number]["sku"];

interface MembershipState extends Membership {
  buy: (sku: Sku) => Purchase;
  restore: () => number;
}

export const useMembership = create<MembershipState>()(
  persist(
    (set, get) => ({
      removeTimers: false,
      premiumPass: false,
      vipBadge: false,
      purchases: [],
      buy: (sku) => {
        const def = PREMIUM_SKUS.find((p) => p.sku === sku)!;
        const p: Purchase = { id: Math.random().toString(36).slice(2), sku, name: def.name, price: def.price, at: Date.now(), simulated: true };
        set((s) => ({
          purchases: [p, ...s.purchases],
          removeTimers: s.removeTimers || sku === "remove_timers",
          premiumPass: s.premiumPass || sku === "premium_pass",
          vipBadge: s.vipBadge || sku === "vip_badge",
        }));
        return p;
      },
      restore: () => {
        const ps = get().purchases;
        set({
          removeTimers: ps.some((p) => p.sku === "remove_timers"),
          premiumPass: ps.some((p) => p.sku === "premium_pass"),
          vipBadge: ps.some((p) => p.sku === "vip_badge"),
        });
        return ps.length;
      },
    }),
    { name: "tourstar-membership", storage: createJSONStorage(() => gameStorage) },
  ),
);
