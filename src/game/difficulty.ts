// How hard a show plays. Two parts:
//  1. The venue: bigger stages mean more notes, faster notes and (at arenas/stadiums) a tighter
//     window for PERFECT. Everyone at that venue gets the same base chart.
//  2. The player's choice: Easy / Normal / Hard. Hard pays more cash and fame, Easy pays less.
//     Reward points never go UP with difficulty (Easy earns fewer, so it can't be farmed).
export type Difficulty = "easy" | "normal" | "hard";

export const DIFFICULTIES: Record<Difficulty, {
  label: string; emoji: string; blurb: string;
  density: number;   // added to the venue's note density (0..1)
  speed: number;     // note fall speed multiplier
  window: number;    // timing window multiplier (bigger = more forgiving)
  pay: number; fame: number; points: number;
  color: string;
}> = {
  easy:   { label: "Easy",   emoji: "🙂", blurb: "Fewer, slower notes and a wider timing window. Pays 15% less cash and fame, fewer points.", density: -0.35, speed: 0.85, window: 1.25, pay: 0.85, fame: 0.85, points: 0.6, color: "var(--success)" },
  normal: { label: "Normal", emoji: "🎸", blurb: "The show as written for this venue.", density: 0, speed: 1, window: 1, pay: 1, fame: 1, points: 1, color: "var(--electric)" },
  hard:   { label: "Hard",   emoji: "🔥", blurb: "More notes, 20% faster, tighter timing. Pays 25% more cash and fame.", density: 0.35, speed: 1.2, window: 0.85, pay: 1.25, fame: 1.25, points: 1, color: "var(--danger)" },
};

const BASE_APPROACH = 1.35; // seconds for a note to fall to the line at the open mic, Normal
const BASE_PERFECT = 0.075; // seconds either side of the beat
const BASE_GOOD = 0.15;

/** Venue tier 1..6 (open mic/bar = 1, stadium encore = 6). */
export function showTuning(tourLevel: number, diff: Difficulty = "normal") {
  const d = DIFFICULTIES[diff] ?? DIFFICULTIES.normal;
  const tier = Math.max(1, Math.min(6, tourLevel));
  // 1. Note density: on-beat only at the open mic, more off-beats each tier.
  const density = Math.max(0, Math.min(1, (tier - 1) / 5 + d.density));
  // 2. Speed: +12% per venue tier (stadium encore ≈ 1.6×), then the player's choice. Never faster than 0.6s.
  const approach = Math.max(0.6, BASE_APPROACH / ((1 + 0.12 * (tier - 1)) * d.speed));
  // 3. Timing: PERFECT tightens at arenas (−10%) and stadiums (−20%).
  const venueTight = tier >= 5 ? 0.8 : tier >= 4 ? 0.9 : 1;
  const perfect = BASE_PERFECT * venueTight * d.window;
  const good = Math.max(perfect + 0.03, BASE_GOOD * d.window);
  return { density, approach, perfect, good, speedLabel: `${(BASE_APPROACH / approach).toFixed(1)}×` };
}
