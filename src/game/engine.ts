import { LABELS, LEVELS, RIVALS, STAT_META } from "./data";
import type { Career, Delta, Stats } from "./types";
import { cfg, levelThresholds } from "./config";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export type LevelDef = { level: number; name: string; fame: number };

/** The levels with the fame thresholds currently set in Admin → Balance. */
export function levels(): LevelDef[] {
  const th = levelThresholds(cfg());
  return LEVELS.map((l) => ({ level: l.level, name: l.name, fame: th[l.level] }));
}

export function levelFor(fame: number): LevelDef {
  const all = levels();
  let cur = all[0];
  for (const l of all) if (fame >= l.fame) cur = l;
  return cur;
}

export function levelProgress(fame: number) {
  const cur = levelFor(fame);
  const next = levels().find((l) => l.level === cur.level + 1);
  if (!next) return { cur, next: null, pct: 100 };
  return { cur, next, pct: Math.min(100, ((fame - cur.fame) / (next.fame - cur.fame)) * 100) };
}

/** Multiplier that scales rewards with career level. */
export const levelMult = (level: number) => Math.pow(1.6, level - 1);

export function clampStats(s: Stats): Stats {
  const out = { ...s };
  (Object.keys(out) as (keyof Stats)[]).forEach((k) => {
    const max = STAT_META[k].max;
    out[k] = Math.round(Math.max(0, max ? Math.min(max, out[k]) : out[k]));
  });
  return out;
}

export function applyDelta(s: Stats, d: Delta): Stats {
  const out = { ...s };
  (Object.keys(d) as (keyof Stats)[]).forEach((k) => {
    out[k] = (out[k] ?? 0) + (d[k] ?? 0);
  });
  return clampStats(out);
}

export function scaleDelta(d: Delta, m: number): Delta {
  const out: Delta = {};
  (Object.keys(d) as (keyof Stats)[]).forEach((k) => (out[k] = Math.round((d[k] ?? 0) * m)));
  return out;
}

export function crewTier(c: Career, role: "manager" | "stylist") {
  return c.crew[`${role}3`] ? 3 : c.crew[`${role}2`] ? 2 : c.crew[`${role}1`] ? 1 : 0;
}

export function crewBonuses(c: Career) {
  const m = crewTier(c, "manager");
  const st = crewTier(c, "stylist");
  return {
    payMult: 1 + [0, 0.1, 0.25, 0.45][m],
    badReduce: [1, 0.85, 0.7, 0.5][m] * (c.crew.security ? 0.75 : 1),
    hypeMult: 1 + [0, 0.1, 0.25, 0.5][st],
    tourEnergyMult: c.crew.bus ? 0.75 : 1,
    tourFameMult: c.crew.lighting ? 1.2 : 1,
    selloutBonus: c.crew.pyro ? 0.15 : 0,
    pyroHype: c.crew.pyro ? 3 : 0,
    healthMult: c.crew.security ? 0.5 : 1,
  };
}

export function labelOf(c: Career) {
  return LABELS.find((l) => l.id === c.labelId) ?? null;
}

export function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}K`;
  return `$${n.toLocaleString()}`;
}

export function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

/** ISO-ish week key, resets Monday 00:00 local. */
export function weekKey(d = new Date()) {
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return todayKey(monday);
}

export function weekProgress(d = new Date()) {
  const monday = new Date(weekKey(d) + "T00:00:00");
  return Math.min(1, Math.max(0.02, (d.getTime() - monday.getTime()) / (7 * 864e5)));
}

/** Deterministic pseudo-random from a string. */
export function hashRand(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export interface ChartRow {
  id: string;
  name: string;
  emoji: string;
  points: number;
  isPlayer?: boolean;
}

export function buildChart(c: Career, now = new Date()): ChartRow[] {
  const wk = c.rivals.weekKey;
  const lvl = levelFor(c.stats.fame).level;
  const scale = 120 * Math.pow(1.7, lvl - 1);
  const prog = wk === weekKey(now) ? weekProgress(now) : 1;
  const rows: ChartRow[] = RIVALS.map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    points: Math.round(scale * r.power * (0.6 + hashRand(wk + r.id) * 0.8) * prog),
  }));
  rows.push({ id: "you", name: c.name, emoji: "⭐", points: c.rivals.points, isPlayer: true });
  return rows.sort((a, b) => b.points - a.points);
}

export function chartReward(rank: number, level: number): Delta | null {
  const m = levelMult(level);
  if (rank === 1) return scaleDelta({ cash: 5000, fame: 120, hype: 10 }, m);
  if (rank <= 3) return scaleDelta({ cash: 2500, fame: 60, hype: 6 }, m);
  if (rank <= 6) return scaleDelta({ cash: 1000, fame: 25, hype: 3 }, m);
  if (rank <= 10) return scaleDelta({ cash: 300, fame: 8 }, m);
  return null;
}

export function moodOf(s: Stats) {
  if (s.health < 25) return { emoji: "🤒", label: "Run Down", tip: "Rest or book a spa day." };
  if (s.energy < 15) return { emoji: "🥱", label: "Exhausted", tip: "Energy refills over time." };
  if (s.relationships < 25) return { emoji: "😔", label: "Lonely", tip: "Call your people. Go home for dinner." };
  if (s.hype > 75) return { emoji: "🤩", label: "On Fire", tip: "Strike now — the buzz is real." };
  if (s.credibility > 70) return { emoji: "😎", label: "Respected", tip: "The critics are listening." };
  if (s.health > 70 && s.energy > 60) return { emoji: "😄", label: "Fired Up", tip: "Ready for anything." };
  return { emoji: "🙂", label: "Chill", tip: "Steady as she goes." };
}

export function legacyScore(c: Career) {
  const s = c.stats;
  return Math.round(s.fame * 1 + s.fans / 20 + s.credibility * 25 + c.totals.earnings / 500 + c.releases.length * 50 + c.totals.sellouts * 200);
}
