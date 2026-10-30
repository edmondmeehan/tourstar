// App navigation: four bottom tabs (Play, Music, Career, Compete) plus the Store in the top bar.
// Each tab groups related pages as sub-tabs. Pages unlock as the career grows so new players
// aren't faced with everything at once; anything newly unlocked gets a "NEW" dot until visited.
import { create } from "zustand";
import { levelFor } from "../game/engine";
import type { Career } from "../game/types";

export interface NavPage { to: string; label: string; icon: string; unlock?: (c: Career) => boolean; hint?: string }
export interface NavGroup { id: string; label: string; icon: string; pages: NavPage[]; unlock?: (c: Career) => boolean; hint?: string }

const gigs = (c: Career) => c.totals?.gigs ?? 0;
const level = (c: Career) => levelFor(c.stats.fame).level;
const released = (c: Career) => (c.releases?.length ?? 0) > 0;

export const GROUPS: NavGroup[] = [
  { id: "play", label: "Play", icon: "🎤", pages: [
    { to: "/dashboard", label: "Home", icon: "🏠" },
    { to: "/tour", label: "Tour", icon: "🚐" },
    { to: "/drums", label: "Drum School", icon: "🥁", unlock: (c) => gigs(c) >= 1, hint: "Play your first show to unlock Drum School." },
  ] },
  { id: "music", label: "Music", icon: "💿", pages: [
    { to: "/album", label: "Studio", icon: "🎛️" },
    { to: "/locker", label: "Songs", icon: "🎧" },
    { to: "/releases", label: "Releases", icon: "📀", unlock: released, hint: "Put out your first release to unlock this." },
    { to: "/radio", label: "Radio", icon: "📻", unlock: released, hint: "Put out your first release to unlock TourStar Radio." },
    { to: "/distribute", label: "Monthly", icon: "🗓️", unlock: released, hint: "Put out your first release to unlock TourStar Monthly." },
  ] },
  { id: "career", label: "Career", icon: "🧑‍🎤", pages: [
    { to: "/summary", label: "Stats", icon: "📊" },
    { to: "/look", label: "Look", icon: "👕" },
    { to: "/label", label: "Label", icon: "🏷️", unlock: (c) => level(c) >= 2, hint: "Reach level 2 to sign with a label." },
    { to: "/management", label: "Crew", icon: "🧑‍🤝‍🧑", unlock: (c) => level(c) >= 2, hint: "Reach level 2 to hire a crew." },
    { to: "/achievements", label: "Awards", icon: "🏅" },
    { to: "/log", label: "Log", icon: "📜" },
  ] },
  { id: "compete", label: "Compete", icon: "⚔️", unlock: (c) => gigs(c) >= 3, hint: "Play 3 shows to unlock leagues, friends and The Press.", pages: [
    { to: "/rivals", label: "Leagues", icon: "⚔️" },
    { to: "/friends", label: "Friends", icon: "🤝" },
    { to: "/press", label: "Press", icon: "📰" },
  ] },
];

/** The Store lives in the top bar; its pages still get sub-tabs. */
export const STORE_GROUP: NavGroup = { id: "store", label: "Store", icon: "🛍️", pages: [
  { to: "/store", label: "Store", icon: "🛍️" },
  { to: "/presales", label: "Presales", icon: "🎟️" },
] };

export const groupOf = (path: string) => [...GROUPS, STORE_GROUP].find((g) => g.pages.some((p) => p.to === path)) ?? null;
export const groupOpen = (g: NavGroup, c: Career) => !g.unlock || g.unlock(c);
export const pageOpen = (p: NavPage, c: Career) => !p.unlock || p.unlock(c);
/** Every page id the player can reach right now. */
export function openPages(c: Career): string[] {
  return GROUPS.flatMap((g) => (groupOpen(g, c) ? g.pages.filter((p) => pageOpen(p, c)).map((p) => p.to) : []));
}

const KEY = "ts_unlock_seen";
function readSeen(): string[] | null {
  try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as string[]) : null; } catch { return null; }
}
function writeSeen(v: string[]) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } }

/** Which unlocked pages the player has already seen (per device), plus each tab's last page. */
export const useNav = create<{
  seen: string[] | null;
  last: Record<string, string>;
  init: (open: string[]) => void;
  visit: (path: string) => void;
}>((set, get) => ({
  seen: readSeen(),
  last: {},
  // First run on this device: whatever is already open counts as seen, so existing players aren't flooded with NEW dots.
  init: (open) => { if (get().seen === null) { writeSeen(open); set({ seen: open }); } },
  visit: (path) => {
    const g = groupOf(path);
    const seen = get().seen ?? [];
    const next = seen.includes(path) ? seen : [...seen, path];
    if (next !== seen) writeSeen(next);
    set({ seen: next, last: g ? { ...get().last, [g.id]: path } : get().last });
  },
}));

export const isNew = (path: string, c: Career, seen: string[] | null) => !!seen && openPages(c).includes(path) && !seen.includes(path);
