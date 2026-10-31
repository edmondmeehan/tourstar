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

/** Tour challenges: on top of the level, each bigger tour asks for a bit of proof first.
 *  A Promoter's Pass (Gold) skips the challenge for that tour. It never adds fame, cash or points. */
export interface TourChallenge { gigs: number; sellouts: number; releases: number }
export const TOUR_CHALLENGES: Record<string, TourChallenge> = {
  "club-tour": { gigs: 5, sellouts: 0, releases: 1 },
  "theater-tour": { gigs: 15, sellouts: 3, releases: 2 },
  "arena-tour": { gigs: 40, sellouts: 10, releases: 4 },
  "stadium-tour": { gigs: 90, sellouts: 25, releases: 6 },
  "stadium-encore": { gigs: 160, sellouts: 50, releases: 8 },
};
export const PASS_GOLD = 150;
export const REFILL_GOLD = 40;

export interface ChallengeStep { label: string; have: number; need: number }
export function challengeSteps(c: Career, tourId: string): ChallengeStep[] {
  const ch = TOUR_CHALLENGES[tourId];
  if (!ch) return [];
  const steps: ChallengeStep[] = [{ label: "Shows played", have: c.totals?.gigs ?? 0, need: ch.gigs }];
  if (ch.sellouts) steps.push({ label: "Sellouts", have: c.totals?.sellouts ?? 0, need: ch.sellouts });
  if (ch.releases) steps.push({ label: "Releases", have: c.releases?.length ?? 0, need: ch.releases });
  return steps;
}
/** Careers started before challenges keep every tour they had already reached. */
export const CHALLENGES_LAUNCH = Date.UTC(2026, 9, 31);
export function grandfatheredPasses(c: Career): string[] {
  if (c.createdAt >= CHALLENGES_LAUNCH) return [];
  return Object.keys(TOUR_CHALLENGES).filter((id) => (c.unlockedTours ?? []).includes(id));
}
/** True once the challenge is done or a pass was used. */
export function challengeMet(c: Career, tourId: string): boolean {
  if (!TOUR_CHALLENGES[tourId]) return true;
  if ((c.tourPasses ?? grandfatheredPasses(c)).includes(tourId)) return true;
  return challengeSteps(c, tourId).every((s) => s.have >= s.need);
}
/** The next tour the player is working toward (unlocked by level but challenge not done), for goal cards and reminders. */
export function nextChallenge(c: Career, level: number, tours: { id: string; level: number }[]) {
  const t = tours.find((x) => x.level <= level && !challengeMet(c, x.id));
  if (!t) return null;
  const steps = challengeSteps(c, t.id);
  const left = steps.reduce((n, s) => n + Math.max(0, s.need - s.have), 0);
  return { tourId: t.id, steps, left };
}

/* ---------------- Wealth: things worth spending a fortune on ---------------- */

/** Where you live. One at a time; upgrading trades in the old place at 60%. Better homes help you recover. */
export interface HomeTier { id: string; name: string; emoji: string; price: number; level: number; upkeep: number; restBonus: number; blurb: string }
export const HOMES: HomeTier[] = [
  { id: "basement", name: "Mom's Basement", emoji: "🛋️", price: 0, level: 1, upkeep: 0, restBonus: 0, blurb: "Free rent. Mom does your laundry." },
  { id: "apartment", name: "City Apartment", emoji: "🏢", price: 60_000, level: 2, upkeep: 300, restBonus: 1, blurb: "Your own place. Thin walls." },
  { id: "loft", name: "Downtown Loft", emoji: "🏙️", price: 500_000, level: 3, upkeep: 2_000, restBonus: 2, blurb: "Exposed brick, a rehearsal corner." },
  { id: "house", name: "Hillside House", emoji: "🏡", price: 3_500_000, level: 4, upkeep: 10_000, restBonus: 3, blurb: "A yard, a pool, a home studio." },
  { id: "mansion", name: "Mansion", emoji: "🏰", price: 18_000_000, level: 5, upkeep: 45_000, restBonus: 4, blurb: "Gates, guests and a guitar-shaped pool." },
  { id: "estate", name: "Legend's Estate", emoji: "🏛️", price: 75_000_000, level: 6, upkeep: 150_000, restBonus: 5, blurb: "Your own museum wing." },
];
export const homeOf = (c: Career) => HOMES.find((h) => h.id === (c.home ?? "basement")) ?? HOMES[0];

/** Career assets: each one makes money or makes shows better. Upkeep is charged once a day. */
export interface Asset { id: string; name: string; emoji: string; price: number; level: number; upkeep: number; perk: string; blurb: string }
export const ASSETS: Asset[] = [
  { id: "venue", name: "Your Own Club", emoji: "🎟️", price: 1_500_000, level: 4, upkeep: 4_000, perk: "+15% pay on shows in your hometown", blurb: "Your name over the door in your hometown." },
  { id: "studio-pro", name: "Pro Recording Studio", emoji: "🎚️", price: 2_500_000, level: 4, upkeep: 5_000, perk: "+20% pay on releases", blurb: "Better rooms, better records." },
  { id: "production", name: "Arena Production", emoji: "💡", price: 6_000_000, level: 5, upkeep: 15_000, perk: "+10% pay on arena and stadium shows", blurb: "Video walls, lifts and a light show." },
  { id: "imprint", name: "Your Own Label", emoji: "🏷️", price: 10_000_000, level: 5, upkeep: 20_000, perk: "Sign acts that earn you money every day", blurb: "Find the next you, and keep a cut." },
];
export const ownsAsset = (c: Career, id: string) => (c.assets ?? []).includes(id);

/** Acts you sign to your own label. Each pays a daily income you collect (holds up to 2 days). */
export interface LabelAct { id: string; name: string; emoji: string; price: number; perDay: number }
export const LABEL_ACTS: LabelAct[] = [
  { id: "neon-kid", name: "Neon Kid", emoji: "🧑‍🎤", price: 2_000_000, perDay: 40_000 },
  { id: "velvet-skyline", name: "Velvet Skyline", emoji: "🌃", price: 5_000_000, perDay: 105_000 },
  { id: "basement-saints", name: "The Basement Saints", emoji: "🎸", price: 12_000_000, perDay: 260_000 },
];
export const LABEL_HOLD_HOURS = 48;
export function labelIncome(c: Career, now = Date.now()) {
  const perDay = LABEL_ACTS.filter((a) => (c.labelActs ?? []).includes(a.id)).reduce((n, a) => n + a.perDay, 0);
  if (!perDay || !c.labelIncomeAt) return { perDay, pending: 0, full: false };
  const hours = Math.min(LABEL_HOLD_HOURS, (now - c.labelIncomeAt) / 36e5);
  return { perDay, pending: Math.floor((perDay * hours) / 24), full: hours >= LABEL_HOLD_HOURS };
}

/** A home in a tour city: travel there costs no energy and you draw a bit better there. */
export function cityHomePrice(level: number) {
  return Math.round(150_000 * Math.pow(2.4, Math.max(0, level - 2)) / 1000) * 1000;
}

/** Giving back: a charity show (once a week) and donations to your foundation (credibility). */
export const CHARITY_COOLDOWN_DAYS = 7;
export function charityCost(level: number) { return Math.round(20_000 * Math.pow(2.6, Math.max(0, level - 1)) / 1000) * 1000; }

/** Daily upkeep for everything you own. */
export function dailyUpkeep(c: Career) {
  return homeOf(c).upkeep + ASSETS.filter((a) => ownsAsset(c, a.id)).reduce((n, a) => n + a.upkeep, 0)
    + (c.cityHomes?.length ?? 0) * Math.round(cityHomePrice(3) * 0.004);
}

/** Net worth: cash plus what you own (valued at 70% of what you paid). */
export function netWorth(c: Career) {
  const lux = LUXURIES.filter((l) => (c.luxury ?? []).includes(l.id)).reduce((n, l) => n + l.price, 0);
  const assets = ASSETS.filter((a) => ownsAsset(c, a.id)).reduce((n, a) => n + a.price, 0);
  const acts = LABEL_ACTS.filter((a) => (c.labelActs ?? []).includes(a.id)).reduce((n, a) => n + a.price, 0);
  const homes = homeOf(c).price + (c.cityHomesPaid ?? 0);
  return Math.max(0, Math.round(c.stats.cash + 0.7 * (lux + assets + acts + homes)));
}
