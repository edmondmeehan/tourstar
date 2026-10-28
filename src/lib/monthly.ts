// TourStar Monthly: a compilation of songs recorded in the AI studio, released on streaming services
// by TourStar, LLC (Admin → Monthly release). Players can find the release and see if their song made it.
import { create } from "zustand";
import { supabase } from "./cloud";

export const LINK_KEYS = [
  { key: "spotify", label: "Spotify" },
  { key: "apple", label: "Apple Music" },
  { key: "youtube", label: "YouTube Music" },
  { key: "amazon", label: "Amazon Music" },
  { key: "tidal", label: "Tidal" },
  { key: "deezer", label: "Deezer" },
  { key: "hyperfollow", label: "All services" },
] as const;
export type LinkKey = (typeof LINK_KEYS)[number]["key"];

export interface MonthlyTrack { n: number; title: string; artist: string; genre: string; mine: boolean }
export interface MonthlyRelease {
  id: string; month: string; title: string; cover_url: string | null; released_on: string | null;
  links: Partial<Record<LinkKey, string>>; tracks: MonthlyTrack[];
}

export const useMonthly = create<{ list: MonthlyRelease[]; loaded: boolean }>(() => ({ list: [], loaded: false }));

export async function refreshMonthly() {
  if (!supabase) return;
  const { data, error } = await supabase.rpc("public_monthly_releases");
  if (!error) useMonthly.setState({ list: (data ?? []) as MonthlyRelease[], loaded: true });
}

export const monthLabel = (month: string) => new Date(`${month.slice(0, 7)}-15T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
