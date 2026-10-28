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
  pointActsPerDay: number;
  bonusEnergyPerDay: number;
  /** Fame needed for each level (level 1 is always 0). */
  levelFame2: number;
  levelFame3: number;
  levelFame4: number;
  levelFame5: number;
  levelFame6: number;
  levelFame7: number;
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
  pointActsPerDay: 12,
  bonusEnergyPerDay: 60,
  levelFame2: 150,
  levelFame3: 700,
  levelFame4: 6000,
  levelFame5: 80000,
  levelFame6: 800000,
  levelFame7: 8000000,
};

export const LEVEL_KEYS = ["levelFame2", "levelFame3", "levelFame4", "levelFame5", "levelFame6", "levelFame7"] as const;

/** Fame thresholds indexed by level (1..7). */
export function levelThresholds(c: GameConfig): number[] {
  return [0, 0, ...LEVEL_KEYS.map((k) => c[k])];
}

/** Admin UI metadata: label, help text and safe bounds for each setting. */
export const CONFIG_FIELDS: { key: keyof GameConfig; label: string; help: string; min: number; max: number; step: number; unit?: string; group?: "levels" }[] = [
  { key: "energyRegenSeconds", label: "Energy refill speed", help: "Seconds per +1 energy. Lower = faster. 36s fills the bar in an hour.", min: 5, max: 300, step: 1, unit: "s" },
  { key: "tourPayMultiplier", label: "Gig payouts", help: "Multiplies cash earned from every tour.", min: 0.25, max: 5, step: 0.05, unit: "×" },
  { key: "releasePayMultiplier", label: "Release payouts", help: "Multiplies cash earned from singles, EPs, LPs.", min: 0.25, max: 5, step: 0.05, unit: "×" },
  { key: "fameMultiplier", label: "Fame gains", help: "Multiplies fame from gigs and releases. Higher = faster level-ups.", min: 0.25, max: 5, step: 0.05, unit: "×" },
  { key: "eventRateMultiplier", label: "Random event rate", help: "How often scandals, parties and offers pop up. 0 turns them off.", min: 0, max: 3, step: 0.05, unit: "×" },
  { key: "dailyRewardMultiplier", label: "Daily rewards", help: "Multiplies the daily login cash reward.", min: 0.25, max: 10, step: 0.25, unit: "×" },
  { key: "renameCost", label: "Rename cost", help: "Game cash to rename after the first free rename.", min: 0, max: 1000000, step: 1000, unit: "$" },
  { key: "pointsMultiplier", label: "Reward points", help: "Multiplies the points players earn for rewards and raffles (gigs, releases, daily claims, level-ups).", min: 0, max: 5, step: 0.05, unit: "×" },
  { key: "pointActsPerDay", label: "Point-earning shows & releases per day", help: "Only this many shows and releases a day earn reward points, so faster energy (VIP) can't buy more points. Free players reach it easily. Quests, daily claims and level-ups still earn points.", min: 1, max: 100, step: 1 },
  { key: "bonusEnergyPerDay", label: "Extra energy per day", help: "Most energy a player can add each day from energy drinks and resting. Stops game cash from buying an endless climb. Gold drops and daily rewards aren't counted.", min: 0, max: 1000, step: 5 },
  { key: "startingCashBonus", label: "Starting cash bonus", help: "Extra game cash for brand-new careers.", min: 0, max: 100000, step: 100, unit: "$" },
  { key: "levelFame2", label: "Level 2 · Local Buzz", help: "Fame needed.", min: 50, max: 5000, step: 50, unit: "★", group: "levels" },
  { key: "levelFame3", label: "Level 3 · Opening Act", help: "Fame needed.", min: 200, max: 20000, step: 100, unit: "★", group: "levels" },
  { key: "levelFame4", label: "Level 4 · Rising Star", help: "Fame needed.", min: 1000, max: 100000, step: 500, unit: "★", group: "levels" },
  { key: "levelFame5", label: "Level 5 · Headliner", help: "Fame needed.", min: 3000, max: 2000000, step: 1000, unit: "★", group: "levels" },
  { key: "levelFame6", label: "Level 6 · Superstar", help: "Fame needed.", min: 10000, max: 20000000, step: 10000, unit: "★", group: "levels" },
  { key: "levelFame7", label: "Level 7 · Legend", help: "Fame needed.", min: 30000, max: 50000000, step: 50000, unit: "★", group: "levels" },
];

export function sanitizeConfig(raw: unknown): GameConfig {
  const out = { ...DEFAULT_CONFIG };
  if (raw && typeof raw === "object") {
    for (const f of CONFIG_FIELDS) {
      const v = Number((raw as Record<string, unknown>)[f.key]);
      if (Number.isFinite(v)) out[f.key] = Math.min(f.max, Math.max(f.min, v));
    }
  }
  // Each level must need more fame than the one before it.
  for (let i = 1; i < LEVEL_KEYS.length; i++) {
    if (out[LEVEL_KEYS[i]] <= out[LEVEL_KEYS[i - 1]]) out[LEVEL_KEYS[i]] = out[LEVEL_KEYS[i - 1]] + 1;
  }
  return out;
}

export const useConfig = create<{ config: GameConfig; setConfig: (c: GameConfig) => void }>((set) => ({
  config: DEFAULT_CONFIG,
  setConfig: (config) => set({ config }),
}));

export const cfg = () => useConfig.getState().config;
