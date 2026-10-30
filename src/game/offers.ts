// Promoter gig offers: every few hours a promoter offers a one-off show at your level with a bonus.
// The offer expires (usually 4 hours), so there's a reason to check in, but nothing is lost by missing it.
import { TOURS } from "./data";
import { challengeMet } from "./economy";
import type { Career } from "./types";
import type { ShowVenue } from "./setlist";

export interface GigOffer {
  id: string;
  tourId: string;
  venue: string;
  emoji: string;
  promoter: string;
  payBonus: number;
  fameBonus: number;
  expires: number;
}

const VENUES = ["The Velvet Room", "Basement 45", "The Blue Lantern", "Neon Cathedral", "The Rusty Anchor", "Skyline Hall", "The Glasshouse", "Echo Park Bowl",
  "The Midnight Mile", "Paper Moon Club", "Harbor Lights Theater", "The Foundry", "Silver Dollar Saloon", "The Lighthouse", "Copper Crown Arena", "Starlight Pavilion"];
const PROMOTERS = ["Dee at Night Owl Presents", "Marco from Loud City", "Jules at Big Sky Live", "Rosa from Sundown Shows", "Theo at Golden Hour", "Priya from Fuse Booking"];
const EMOJI = ["🎪", "🌃", "🎟️", "🏟️", "🌆", "🎆"];

export const OFFER_HOURS = 4;
/** Hours between offers once one is used or expires. */
export const OFFER_GAP_HOURS = 5;

const pick = <T,>(a: readonly T[], r: number) => a[Math.floor(r * a.length) % a.length];

export function makeOffer(c: Career, level: number, now = Date.now()): GigOffer | null {
  const open = TOURS.filter((t) => t.level <= level && challengeMet(c, t.id));
  if (!open.length) return null;
  // One of your two biggest stages.
  const top = open.slice(-2);
  const r = Math.random();
  const t = pick(top, r);
  return {
    id: `o${now.toString(36)}`,
    tourId: t.id,
    venue: pick(VENUES, Math.random()),
    emoji: pick(EMOJI, Math.random()),
    promoter: pick(PROMOTERS, Math.random()),
    payBonus: 40 + Math.round(Math.random() * 6) * 10, // +40% to +100%
    fameBonus: 10 + Math.round(Math.random() * 4) * 5, // +10% to +30%
    expires: now + OFFER_HOURS * 36e5 + (c.id.charCodeAt(0) % 30) * 6e4,
  };
}

export const offerVenue = (o: GigOffer): ShowVenue => ({ id: `offer:${o.id}`, name: o.venue, emoji: o.emoji, fameBonus: o.fameBonus, payBonus: o.payBonus, offerId: o.id });
