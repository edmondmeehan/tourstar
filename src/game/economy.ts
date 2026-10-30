// Economy helpers that keep cash meaningful as a career grows:
// cash packs sized to your stage, crew payroll on every show, and big lifestyle buys to spend on.
import { levelFor } from "./engine";
import type { Career } from "./types";

/** Cash packs give roughly a quarter of a day (small) or a full day (large) of an average player's earnings at their level. */
const PACK_SMALL = [0, 2_000, 8_000, 25_000, 90_000, 225_000, 600_000, 600_000];
const PACK_LARGE = [0, 8_000, 30_000, 110_000, 350_000, 900_000, 2_500_000, 2_500_000];
export function cashPackAmount(sku: "cash_small" | "cash_large", c: Career | null | undefined): number {
  const lvl = c ? Math.max(levelFor(c.stats.fame).level, c.peakLevel ?? 1) : 1;
  const i = Math.min(7, Math.max(1, lvl));
  return sku === "cash_small" ? PACK_SMALL[i] : PACK_LARGE[i];
}

/** Each crew member takes a cut of every show's take (2% each, 15% at most). */
export function crewPayroll(c: Career, gross: number): number {
  const hired = Object.values(c.crew ?? {}).filter(Boolean).length;
  return Math.round(Math.max(0, gross) * Math.min(0.15, hired * 0.02));
}

/** Big lifestyle buys: cosmetic only, shown on your profile and share cards. */
export interface Luxury { id: string; name: string; emoji: string; price: number; level: number; blurb: string }
export const LUXURIES: Luxury[] = [
  { id: "guitars", name: "Vintage Guitar Wall", emoji: "🎸", price: 250_000, level: 3, blurb: "A wall of classic axes. Never played, always admired." },
  { id: "studio", name: "Private Studio", emoji: "🎚️", price: 2_000_000, level: 4, blurb: "Your own room, your own hours, your own coffee machine." },
  { id: "mansion", name: "Hilltop Mansion", emoji: "🏰", price: 10_000_000, level: 5, blurb: "Pool shaped like a guitar. Neighbors not thrilled." },
  { id: "jet", name: "Private Jet", emoji: "🛩️", price: 40_000_000, level: 6, blurb: "Wheels up. Your name on the tail." },
  { id: "island", name: "Private Island", emoji: "🏝️", price: 150_000_000, level: 7, blurb: "The ultimate flex. Album release parties only." },
];
