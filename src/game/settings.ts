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

/**
 * What's for sale. Money never buys reward points or raffle chances: purchases speed things up,
 * add AI songs and cosmetics, and nothing else. (Points are capped per day for everyone.)
 * kind: "sub" = auto-renewing subscription, "consumable" = can be bought again.
 */
export const PREMIUM_SKUS = [
  { sku: "vip_monthly", kind: "sub", name: "TourStar VIP · Monthly", price: 4.99, period: "month", emoji: "👑", blurb: "All VIP perks, billed monthly." },
  { sku: "vip_yearly", kind: "sub", name: "TourStar VIP · Yearly", price: 39.99, period: "year", emoji: "👑", blurb: "All VIP perks. Save 33%." },
  { sku: "gold_100", kind: "consumable", name: "100 Gold Records", price: 0.99, emoji: "💿", blurb: "Spend on drops: stages, titles, badges and artist packs." },
  { sku: "gold_550", kind: "consumable", name: "550 Gold Records", price: 4.99, emoji: "💿", blurb: "10% bonus Gold." },
  { sku: "gold_1200", kind: "consumable", name: "1,200 Gold Records", price: 9.99, emoji: "📀", blurb: "20% bonus Gold. Most popular." },
  { sku: "gold_2500", kind: "consumable", name: "2,500 Gold Records", price: 19.99, emoji: "🏆", blurb: "25% bonus Gold. Best value." },
  { sku: "ai_songs_5", kind: "consumable", name: "Studio Session · 5 AI songs", price: 2.99, emoji: "🎧", blurb: "5 extra real AI recordings, on top of your free daily songs." },
  { sku: "ai_songs_15", kind: "consumable", name: "Studio Week · 15 AI songs", price: 6.99, emoji: "🎚️", blurb: "15 extra real AI recordings. Best value." },
  { sku: "cash_small", kind: "consumable", name: "Small Cash Pack", price: 2.99, emoji: "💵", blurb: "About a quarter of a day's earnings at your level." },
  { sku: "cash_large", kind: "consumable", name: "Big Cash Pack", price: 9.99, emoji: "💰", blurb: "About a full day's earnings at your level." },
] as const;

/** VIP perks, shown on the Premium screen. Keep in sync with the game rules. */
export const VIP_PERKS = [
  "⚡ Energy refills 2× faster, lockouts cut in half",
  "🎧 +3 free AI songs every day",
  "💵 +50% daily cash reward",
  "💿 150 Gold Records every month",
  "💎 VIP badge and a gold name on the charts",
];

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
          removeTimers: s.removeTimers || def.kind === "sub",
          premiumPass: s.premiumPass || def.kind === "sub",
          vipBadge: s.vipBadge || def.kind === "sub",
        }));
        return p;
      },
      restore: () => {
        const ps = get().purchases;
        set({
          removeTimers: ps.some((p) => p.sku.startsWith("vip_")),
          premiumPass: ps.some((p) => p.sku.startsWith("vip_")),
          vipBadge: ps.some((p) => p.sku.startsWith("vip_")),
        });
        return ps.length;
      },
    }),
    { name: "tourstar-membership", storage: createJSONStorage(() => gameStorage) },
  ),
);
