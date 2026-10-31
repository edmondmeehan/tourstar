// Game Center (iPhone only): sign in quietly after the tutorial, mirror TourStar's achievements and
// report two leaderboards (all-time fame and net worth). The plugin lives in plugins/game-center.
// Everything is optional and fails quietly: TourStar's own achievements and leagues are the source of truth.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { create } from "zustand";
import { useGame } from "../game/store";
import { ACHIEVEMENTS } from "../game/achievements";
import { netWorth } from "../game/economy";

interface Player { authenticated: boolean; playerId?: string; alias?: string; error?: string }
interface GameCenterPlugin {
  authenticate(): Promise<Player>;
  status(): Promise<Player>;
  submitScore(o: { leaderboardId: string; score: number }): Promise<{ submitted: boolean }>;
  reportAchievement(o: { achievementId: string; percent: number }): Promise<{ reported: boolean }>;
  showDashboard(o: { view?: "achievements" | "leaderboards" | "dashboard"; leaderboardId?: string }): Promise<{ shown: boolean }>;
}
const GC = registerPlugin<GameCenterPlugin>("GameCenter");

/** IDs to create in App Store Connect → Game Center (see docs/game-center.md). */
export const GC_PREFIX = "co.please.tourstar";
export const LEADERBOARDS = { fame: `${GC_PREFIX}.fame`, networth: `${GC_PREFIX}.networth` };
export const achievementId = (id: string) => `${GC_PREFIX}.ach.${id}`;

export const available = Capacitor.getPlatform() === "ios";
export const useGameCenter = create<{ player: Player | null }>(() => ({ player: null }));

const KEY = "ts_gc_reported";
function reported(): Record<string, number> { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>; } catch { return {}; } }

let syncing = false;
/** Send achievement progress and scores (only what changed since last time). */
export async function syncGameCenter() {
  if (!available || syncing || !useGameCenter.getState().player?.authenticated) return;
  const c = useGame.getState().career;
  if (!c) return;
  syncing = true;
  try {
    const done = reported();
    for (const a of ACHIEVEMENTS) {
      const pct = Math.min(100, Math.floor((a.progress(c) / a.target) * 100));
      if (pct <= (done[a.id] ?? 0)) continue;
      const r = await GC.reportAchievement({ achievementId: achievementId(a.id), percent: pct }).catch(() => ({ reported: false }));
      if (r.reported) done[a.id] = pct;
    }
    try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* fine */ }
    await GC.submitScore({ leaderboardId: LEADERBOARDS.fame, score: Math.max(0, Math.floor(c.stats.fame)) }).catch(() => undefined);
    await GC.submitScore({ leaderboardId: LEADERBOARDS.networth, score: Math.max(0, Math.floor(netWorth(c))) }).catch(() => undefined);
  } finally {
    syncing = false;
  }
}

export async function signInGameCenter() {
  if (!available) return null;
  const p = await GC.authenticate().catch(() => ({ authenticated: false }) as Player);
  useGameCenter.setState({ player: p });
  if (p.authenticated) void syncGameCenter();
  return p;
}

export function openGameCenter(view: "achievements" | "leaderboards" | "dashboard" = "dashboard") {
  if (!available) return;
  void GC.showDashboard({ view });
}

let started = false;
export function startGameCenter() {
  if (started || !available) return;
  started = true;
  // Ask once Mo's walkthrough is over, so Apple's sign-in sheet never interrupts the first show.
  const tryAuth = () => { const c = useGame.getState().career; if (c && !c.tutorial && !useGameCenter.getState().player) void signInGameCenter(); };
  tryAuth();
  let lastGigs = useGame.getState().career?.totals.gigs ?? 0;
  let timer: number | undefined;
  useGame.subscribe((s) => {
    tryAuth();
    const g = s.career?.totals.gigs ?? 0;
    if (g !== lastGigs) { lastGigs = g; window.clearTimeout(timer); timer = window.setTimeout(() => void syncGameCenter(), 4000); }
  });
  void App.addListener("appStateChange", ({ isActive }) => { if (!isActive) void syncGameCenter(); });
}
