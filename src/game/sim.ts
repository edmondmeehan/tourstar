// Rough model of how fast a career climbs, used by Admin → Balance to preview changes before they go live.
// It plays a simple "best fame per energy" strategy day by day: the energy a player gets from their check-ins,
// spent on the best unlocked tour or release they can afford. It's an estimate to compare settings,
// not a prediction; check it against "Real players" (measured from level-ups) once there's data.
import { LEVELS, RELEASES, TOURS } from "./data";
import type { GameConfig } from "./config";
import { levelThresholds } from "./config";

export interface PlayerType {
  id: string;
  label: string;
  /** Times a day the player opens the game and spends their energy. */
  sessions: number;
  /** Average show score 0..1 (performance + setlist). */
  score: number;
  vip: boolean;
}

export const PLAYER_TYPES: PlayerType[] = [
  { id: "casual", label: "Casual", sessions: 2, score: 0.6, vip: false },
  { id: "average", label: "Average", sessions: 4, score: 0.75, vip: false },
  { id: "dedicated", label: "Dedicated", sessions: 8, score: 0.88, vip: false },
  { id: "vip", label: "Dedicated VIP", sessions: 12, score: 0.88, vip: true },
];

const HYPE = 35; // typical hype a playing artist holds
const SELLOUT = 0.3; // share of shows that sell out
const UPKEEP = 0.85; // share of energy that goes to shows/releases (rest, events, rehab take the rest)
const MAX_DAYS = 730;

/** Energy a player can spend per day: a full bar per check-in, limited by how fast the bar refills while awake. */
export function energyPerDay(p: PlayerType, cfg: GameConfig) {
  const interval = cfg.energyRegenSeconds * (p.vip ? 0.5 : 1);
  const awake = (16 * 3600) / interval + 100; // refills over 16 waking hours plus a full bar overnight
  const extra = cfg.bonusEnergyPerDay * (p.sessions >= 4 ? 1 : 0.5); // energy drinks / rest, up to the daily cap
  return (Math.min(p.sessions * 100, awake) + extra) * UPKEEP;
}

/** Days to reach each level (index = level). Infinity if not reached within two years. */
export function simulateClimb(p: PlayerType, cfg: GameConfig): number[] {
  const th = levelThresholds(cfg);
  const lvlOf = (f: number) => { let l = 1; for (let i = 2; i <= 7; i++) if (f >= th[i]) l = i; return l; };
  const days: number[] = [0, 0, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity];
  let fame = 0, cash = 500 + cfg.startingCashBonus, lighting = false;
  const daily = energyPerDay(p, cfg);
  const fameM = (0.6 + 0.9 * p.score) * (p.score >= 0.85 ? 1.1 : 1); // S ranks add 25% some of the time
  const payM = 0.75 + 0.5 * p.score;

  for (let day = 1; day <= MAX_DAYS; day++) {
    let energy = daily;
    let guard = 0;
    while (energy > 0 && guard++ < 200) {
      const lvl = lvlOf(fame);
      // Lighting rig (+20% tour fame) once it's cheap relative to cash.
      if (!lighting && lvl >= 3 && cash > 60000) { lighting = true; cash -= 30000; }
      type Opt = { e: number; fame: number; cash: number };
      const opts: Opt[] = [];
      for (const t of TOURS) {
        if (t.level > lvl || t.cost > cash || t.energy > energy + 10) continue;
        const famex = (1 + HYPE / 100) * (lighting ? 1.2 : 1) * cfg.fameMultiplier * (1 + SELLOUT * 0.5);
        const att = SELLOUT + (1 - SELLOUT) * 0.65;
        opts.push({ e: t.energy, fame: t.fame * famex * fameM, cash: t.pay * att * (1 + HYPE / 200) * cfg.tourPayMultiplier * payM - t.cost });
      }
      for (const r of RELEASES) {
        if (r.level > lvl || r.cost > cash || r.energy > energy + 10) continue;
        const m = Math.pow(1.6, lvl - 1);
        opts.push({ e: r.energy, fame: r.fame * 0.92 * m * cfg.fameMultiplier, cash: r.pay * 0.92 * m * cfg.releasePayMultiplier - r.cost });
      }
      if (!opts.length) break;
      const best = opts.reduce((a, b) => (b.fame / b.e > a.fame / a.e ? b : a));
      energy -= best.e;
      fame += best.fame;
      cash += best.cash;
      const now = lvlOf(fame);
      for (let l = 2; l <= now; l++) if (days[l] === Infinity) days[l] = day;
    }
    if (days[7] !== Infinity) break;
  }
  return days;
}

export const fmtDays = (d: number) => (d === Infinity ? "2 yrs+" : d <= 1 ? "1 day" : d < 60 ? `${d} days` : `${(d / 30.4).toFixed(1)} mo`);
export const LEVEL_NAMES = LEVELS.map((l) => l.name);
