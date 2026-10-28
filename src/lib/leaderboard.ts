// Real-player leaderboards (weekly fame gained, all-time fame, by genre). Scores come from cloud saves on
// the server; the weekly top 10 get Gold, a badge and a title when the week resets (Mondays, 00:00 UTC).
import { create } from "zustand";
import { supabase, useCloud } from "./cloud";
import { refreshGold } from "./gold";

export interface LbRow { rank: number; name: string; genre: string | null; level: number; badge: string | null; score: number; me: boolean }
export interface Leaderboard {
  board: "week" | "all"; week: string; resets_at: string; total: number; rows: LbRow[];
  me: { rank: number; score: number; pct: number } | null;
  last_week: { rank: number; name: string; score: number }[];
}

export const useMyRank = create<{ rank: number | null; pct: number | null; score: number; loaded: boolean }>(() => ({ rank: null, pct: null, score: 0, loaded: false }));

export async function loadLeaderboard(board: "week" | "all", genre: string | null): Promise<Leaderboard | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("leaderboard", { p_board: board, p_genre: genre });
  if (error) throw error;
  const lb = data as Leaderboard;
  if (board === "week" && !genre) useMyRank.setState({ rank: lb.me?.rank ?? null, pct: lb.me?.pct ?? null, score: lb.me?.score ?? 0, loaded: true });
  return lb;
}

let started = false;
/** Pays out last week's leaderboard (once, server-side) and loads your weekly rank. */
export function startLeaderboard() {
  if (started || !supabase) return;
  started = true;
  void supabase.rpc("leaderboard_settle").then(({ data }) => { if (Number(data) > 0) void refreshGold(); });
  const refresh = () => { if (useCloud.getState().session) void loadLeaderboard("week", null).catch(() => undefined); };
  refresh();
  window.setInterval(refresh, 10 * 60_000);
  useCloud.subscribe((s, p) => { if (s.session?.user.id !== p.session?.user.id) refresh(); });
}

export function resetsIn(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "soon";
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
  return d ? `${d}d ${h}h` : `${h}h`;
}
