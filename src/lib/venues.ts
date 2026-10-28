// Featured venues (Admin → Partners & venues): real, licensed venues players can book as tour stops.
// A venue reuses a base tour's pay/energy/fame, adds a fame bonus, its own stage look and real capacity,
// and can link to the venue's real upcoming shows. Views, plays and ticket taps are counted for the partner.
import { create } from "zustand";
import { supabase } from "./cloud";
import { useLive } from "./live";
import { ownedItems } from "./gold";
import { openTickets } from "./presales";
import type { ShowVenue } from "../game/setlist";

export interface Venue {
  id: string; partner_id: string | null; name: string; city: string; emoji: string; tagline: string; image_url: string | null;
  base_tour: string; capacity: number | null; stage_theme: string | null; fame_bonus_pct: number;
  ticket_url: string | null; ticket_label: string; pack_only: boolean; sponsored: boolean;
  starts_at: string; ends_at: string | null; sort: number;
}

export const useVenues = create<{ venues: Venue[]; loaded: boolean }>(() => ({ venues: [], loaded: false }));

export async function refreshVenues() {
  if (!supabase) return;
  const { data, error } = await supabase.from("venues").select("*").order("sort").order("name");
  if (!error) useVenues.setState({ venues: (data ?? []) as Venue[], loaded: true });
}

/** Pack-only venues need a pack containing them; the rest are open to everyone at the base tour's level. */
export const venueUnlocked = (v: Venue) => !v.pack_only || ownedItems().some((i) => i.type === "venue" && i.id === v.id);

export const showVenue = (v: Venue): ShowVenue => ({ id: v.id, name: v.name, emoji: v.emoji, theme: v.stage_theme, fameBonus: v.fame_bonus_pct, capacity: v.capacity });

const viewed = new Set<string>();
export function trackVenue(id: string, kind: "view" | "play" | "ticket") {
  if (!supabase) return;
  if (kind === "view") { if (viewed.has(id)) return; viewed.add(id); }
  void supabase.rpc("venue_event", { p_venue: id, p_kind: kind, p_device: useLive.getState().deviceId });
}

export async function openVenueTickets(v: Venue) {
  if (!v.ticket_url) return;
  trackVenue(v.id, "ticket");
  await openTickets(v.ticket_url);
}
