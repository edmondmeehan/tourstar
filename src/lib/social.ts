// Weekly leagues, friends (with the festival bill) and the Hall of Fame. All need a signed-in, synced save.
import { create } from "zustand";
import { supabase, useCloud } from "./cloud";
import { refreshGold } from "./gold";
import { useGame } from "../game/store";
import type { Look } from "../game/looks";

export const TIERS = [
  { tier: 1, name: "Garage League", emoji: "🏚️", color: "#9aa0a6" },
  { tier: 2, name: "Club League", emoji: "🎸", color: "#3dd68c" },
  { tier: 3, name: "Theater League", emoji: "🎭", color: "#1aa3ff" },
  { tier: 4, name: "Arena League", emoji: "🏟️", color: "#b46bff" },
  { tier: 5, name: "Stadium League", emoji: "🌆", color: "#ff42d8" },
  { tier: 6, name: "Legends League", emoji: "👑", color: "#f2c230" },
] as const;
export const tierOf = (n: number) => TIERS[Math.max(0, Math.min(5, n - 1))];

export interface LeagueRow { rank: number; name: string; level: number; badge: string | null; look: Partial<Look> | null; score: number; me: boolean }
export interface League {
  joined: boolean; reason?: "signin" | "save";
  week: string; tier: number; size: number; up: number; down: number; resets_at: string;
  gold_on: boolean; gold_per_tier: number; rows: LeagueRow[];
  result: { week: string; tier: number; rank: number; size: number; next_tier: number; gold: number } | null;
}

export const useLeague = create<{ league: League | null; loaded: boolean }>(() => ({ league: null, loaded: false }));

export async function loadLeague(ack = false): Promise<League | null> {
  if (!supabase || !useCloud.getState().session) { useLeague.setState({ league: null, loaded: true }); return null; }
  const { data, error } = await supabase.rpc("my_league", { p_ack: ack });
  if (error) { useLeague.setState({ loaded: true }); return null; }
  const l = (data ?? null) as League | null;
  useLeague.setState({ league: l, loaded: true });
  if (l?.result) useGame.getState().noteLeagueResult(l.result.week, l.result.tier, l.result.next_tier);
  return l;
}

let started = false;
/** Close last week's leagues (pays Gold once, server-side) and load yours. */
export function startSocial() {
  if (started || !supabase) return;
  started = true;
  const go = async () => {
    if (!useCloud.getState().session) return;
    const { data } = await supabase!.rpc("league_settle");
    if (Number(data) > 0) void refreshGold();
    await loadLeague();
  };
  void go();
  window.setInterval(() => void loadLeague(), 10 * 60_000);
  useCloud.subscribe((s, p) => { if (s.session?.user.id !== p.session?.user.id) void go(); });
}

export interface FriendRow { code: string; name: string; genre: string | null; level: number; badge: string | null; look: Partial<Look> | null; fame: number; week_fame: number; week_gigs: number; active_at: string | null }
export interface Friends { code: string | null; week: string; rows: FriendRow[]; bill: { mine: number; friends: number; goals: number[] } }

export async function loadFriends(): Promise<Friends | null> {
  if (!supabase || !useCloud.getState().session) return null;
  await supabase.rpc("my_friend_code");
  const { data, error } = await supabase.rpc("my_friends");
  if (error) throw error;
  return data as Friends;
}

export async function addFriend(code: string): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: "Accounts aren't set up in this build." };
  const { data, error } = await supabase.rpc("add_friend", { p_code: code });
  return error ? { ok: false, message: error.message } : { ok: true, message: `You and ${data} are now friends.` };
}

export async function removeFriend(code: string) {
  if (supabase) await supabase.rpc("remove_friend", { p_code: code });
}

export interface HallRow { name: string; genre: string | null; fame: number; weeks: number; gigs: number; look: Partial<Look> | null; retired_at: string; me: boolean }
export async function loadHall(): Promise<HallRow[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("hall_of_fame_list");
  return (data ?? []) as HallRow[];
}

export async function enterHall(): Promise<{ ok: boolean; message: string }> {
  if (!supabase || !useCloud.getState().session) return { ok: true, message: "" }; // guests retire without a Hall entry
  const { data, error } = await supabase.rpc("enter_hall_of_fame");
  if (error) return { ok: false, message: error.message };
  const r = data as { rank?: number };
  return { ok: true, message: r.rank ? `Entered the Hall of Fame at #${r.rank}.` : "" };
}

export function relTime(iso: string | null) {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return m <= 1 ? "just now" : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
