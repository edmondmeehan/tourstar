// Live balance settings. Defaults ship in the app; admins can override them from /admin → Balance
// (stored in Supabase `game_config`), and every player picks the new values up on next launch / within 5 min.
import { create } from "zustand";

export interface GameConfig {
  energyRegenSeconds: number; // seconds per +1 energy
  tourPayMultiplier: number;
  releasePayMultiplier: number;
  fameMultiplier: number;
  eventRateMultiplier: number;
  dailyRewardMultiplier: number;
  renameCost: number;
  startingCashBonus: number;
  pointsMultiplier: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  energyRegenSeconds: 36,
  tourPayMultiplier: 1,
  releasePayMultiplier: 1,
  fameMultiplier: 1,
  eventRateMultiplier: 1,
  dailyRewardMultiplier: 1,
  renameCost: 50000,
  startingCashBonus: 0,
  pointsMultiplier: 1,
};

/** Admin UI metadata: label, help text and safe bounds for each setting. */
export const CONFIG_FIELDS: { key: keyof GameConfig; label: string; help: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: "energyRegenSeconds", label: "Energy refill speed", help: "Seconds per +1 energy. Lower = faster. 36s fills the bar in an hour.", min: 5, max: 300, step: 1, unit: "s" },
  { key: "tourPayMultiplier", label: "Gig payouts", help: "Multiplies cash earned from every tour.", min: 0.25, max: 5, step: 0.05, unit: "×" },
  { key: "releasePayMultiplier", label: "Release payouts", help: "Multiplies cash earned from singles, EPs, LPs.", min: 0.25, max: 5, step: 0.05, unit: "×" },
  { key: "fameMultiplier", label: "Fame gains", help: "Multiplies fame from gigs and releases. Higher = faster level-ups.", min: 0.25, max: 5, step: 0.05, unit: "×" },
  { key: "eventRateMultiplier", label: "Random event rate", help: "How often scandals, parties and offers pop up. 0 turns them off.", min: 0, max: 3, step: 0.05, unit: "×" },
  { key: "dailyRewardMultiplier", label: "Daily rewards", help: "Multiplies the daily login cash reward.", min: 0.25, max: 10, step: 0.25, unit: "×" },
  { key: "renameCost", label: "Rename cost", help: "Game cash to rename after the first free rename.", min: 0, max: 1000000, step: 1000, unit: "$" },
  { key: "pointsMultiplier", label: "Reward points", help: "Multiplies the points players earn for rewards and raffles (gigs, releases, daily claims, level-ups).", min: 0, max: 5, step: 0.05, unit: "×" },
  { key: "startingCashBonus", label: "Starting cash bonus", help: "Extra game cash for brand-new careers.", min: 0, max: 100000, step: 100, unit: "$" },
];

export function sanitizeConfig(raw: unknown): GameConfig {
  const out = { ...DEFAULT_CONFIG };
  if (raw && typeof raw === "object") {
    for (const f of CONFIG_FIELDS) {
      const v = Number((raw as Record<string, unknown>)[f.key]);
      if (Number.isFinite(v)) out[f.key] = Math.min(f.max, Math.max(f.min, v));
    }
  }
  return out;
}

export const useConfig = create<{ config: GameConfig; setConfig: (c: GameConfig) => void }>((set) => ({
  config: DEFAULT_CONFIG,
  setConfig: (config) => set({ config }),
}));

export const cfg = () => useConfig.getState().config;
