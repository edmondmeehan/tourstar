// Time-limited tour events (Admin → Tour events): a special venue that only exists for a week or two,
// a goal (play N shows there) and an exclusive collectible. Stored in app_public_config.tour_event.
import { create } from "zustand";
import { supabase } from "./cloud";
import { refreshGold } from "./gold";
import type { ShowVenue } from "../game/setlist";
import { TOURS } from "../game/data";
import type { DropItem } from "../game/cosmetics";

export interface TourEvent {
  id: string;
  enabled: boolean;
  name: string;
  emoji: string;
  blurb: string;
  /** ISO times. */
  starts: string;
  ends: string;
  /** The event stage: a size from the tour circuit ("auto" = each player's biggest stage) plus its own name and bonuses. */
  venue: { name: string; emoji: string; base_tour: string; capacity: number | null; fame_bonus: number; pay_bonus: number; theme: string | null };
  /** Shows at the event venue to earn the reward. */
  goal: number;
  /** Collectibles (badge, title, stage) given by the server once. */
  reward: DropItem[];
}

export const BLANK_EVENT: TourEvent = {
  id: "", enabled: false, name: "", emoji: "🎃", blurb: "", starts: "", ends: "",
  venue: { name: "", emoji: "🎪", base_tour: "auto", capacity: null, fame_bonus: 25, pay_bonus: 25, theme: null },
  goal: 5, reward: [],
};

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : d; };

export function parseEvent(raw: unknown): TourEvent | null {
  let v: Record<string, unknown>;
  try { v = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>; } catch { return null; }
  if (!v || typeof v !== "object" || !str(v.id, 40)) return null;
  const vv = (v.venue ?? {}) as Record<string, unknown>;
  return {
    id: str(v.id, 40), enabled: v.enabled === true, name: str(v.name, 50), emoji: str(v.emoji, 8) || "🎪", blurb: str(v.blurb, 200),
    starts: str(v.starts, 40), ends: str(v.ends, 40),
    venue: {
      name: str(vv.name, 50) || str(v.name, 50), emoji: str(vv.emoji, 8) || "🎪", base_tour: str(vv.base_tour, 30) || "auto",
      capacity: vv.capacity ? num(vv.capacity, 10, 200000, 0) : null, fame_bonus: num(vv.fame_bonus, 0, 50, 0), pay_bonus: num(vv.pay_bonus, 0, 100, 0),
      theme: str(vv.theme, 30) || null,
    },
    goal: num(v.goal, 1, 50, 5),
    reward: Array.isArray(v.reward) ? (v.reward as DropItem[]).slice(0, 4) : [],
  };
}

export const eventLive = (e: TourEvent | null, at = Date.now()) =>
  !!e && e.enabled && Date.parse(e.starts) <= at && at < Date.parse(e.ends);

export const useTourEvent = create<{ event: TourEvent | null }>(() => ({ event: null }));

export async function loadTourEvent() {
  if (!supabase) return;
  const { data } = await supabase.from("app_public_config").select("value").eq("key", "tour_event").maybeSingle();
  useTourEvent.setState({ event: parseEvent(data?.value ?? null) });
}

/** The stage size for this player: a fixed size, or "auto" = their biggest unlocked stage (everyone can play). */
export function eventTour(e: TourEvent, level: number) {
  const open = TOURS.filter((t) => t.level <= level);
  return e.venue.base_tour === "auto" ? open[open.length - 1] ?? TOURS[0] : TOURS.find((t) => t.id === e.venue.base_tour) ?? TOURS[0];
}

/** The event venue as a show venue (copied into the show when booked). */
export function eventVenue(e: TourEvent): ShowVenue {
  return { id: `event:${e.id}`, name: e.venue.name, emoji: e.venue.emoji, theme: e.venue.theme, fameBonus: e.venue.fame_bonus, capacity: e.venue.capacity, payBonus: e.venue.pay_bonus, eventId: e.id };
}

export function timeLeft(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "ended";
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export async function claimEventReward(id: string): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: "Accounts aren't set up in this build." };
  const { data, error } = await supabase.rpc("claim_tour_event", { p_id: id });
  if (error) return { ok: false, message: error.message };
  void refreshGold();
  return { ok: true, message: (data as { already?: boolean })?.already ? "You already have this one." : "Added to your collection. Equip it under Store → Drops → My style." };
}
