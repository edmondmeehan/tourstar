// Setlists and show scoring. Pure functions, no store access.
import type { Career } from "./types";

export interface SetSong {
  key: string; // "r:<releaseId>" | "s:<songId>" | "c:<n>"
  title: string;
  appeal: number; // 0-100 before bonuses
  seed: number;
  plays: number;
  cover: boolean;
  tag: "FAN FAVE" | "NEW" | "COVER" | null;
}

export type EncoreChoice = "hit" | "debut" | "walk";

export interface PendingShow {
  tourId: string;
  setlist: string[];
  attendance: number;
  sellout: boolean;
  requestKey: string | null;
  at: number;
  /** Player's chosen difficulty (older saves: normal). */
  difficulty?: import("./difficulty").Difficulty;
}

/** Songs per show by tour size. */
export const SET_SLOTS: Record<string, number> = {
  "open-mic": 2, "bar-gig": 3, "club-tour": 3, "theater-tour": 4, "arena-tour": 4, "stadium-tour": 5, "stadium-encore": 5,
};

const COVERS = ["Cover: Midnight Train", "Cover: Hometown Anthem", "Cover: Radio Gold", "Cover: Last Dance", "Cover: Summer Hit"];
export const FAVE_PLAYS = 4;

export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function songPool(c: Career): SetSong[] {
  const plays = c.setPlays ?? {};
  const out: SetSong[] = [];
  const mk = (key: string, title: string, appeal: number, seed: number, cover = false): SetSong => {
    const p = plays[key] ?? 0;
    const fave = !cover && p >= FAVE_PLAYS;
    return {
      key, title, seed, plays: p, cover,
      appeal: Math.min(100, appeal + (fave ? 15 : 0)),
      tag: cover ? "COVER" : fave ? "FAN FAVE" : p === 0 ? "NEW" : null,
    };
  };
  for (const r of c.releases) {
    const song = r.songId ? c.songs.find((s) => s.id === r.songId) : undefined;
    out.push(mk(`r:${r.id}`, r.title, r.quality, song?.seed ?? hashStr(r.id)));
  }
  for (const s of c.songs) {
    if (s.source === "release") continue;
    out.push(mk(`s:${s.id}`, s.title, s.appeal ?? 60, s.seed));
  }
  COVERS.forEach((t, i) => out.push(mk(`c:${i}`, t, 42, 777 + i * 1013, true)));
  return out;
}

/** The song the crowd is shouting for this show (changes every gig). */
export function fanRequest(c: Career, pool = songPool(c)): string | null {
  const own = pool.filter((s) => !s.cover);
  if (own.length < 2) return null;
  return own[hashStr(c.id + ":" + c.totals.gigs) % own.length].key;
}

/** Best songs first, strongest last (closer), second strongest opens. */
export function autoSetlist(pool: SetSong[], slots: number, requestKey: string | null): string[] {
  const ranked = [...pool].sort((a, b) => b.appeal - a.appeal || a.title.localeCompare(b.title));
  let pick = ranked.slice(0, slots);
  const req = pool.find((s) => s.key === requestKey);
  if (req && !pick.includes(req) && req.appeal >= 40) pick = [...pick.slice(0, slots - 1), req];
  pick.sort((a, b) => b.appeal - a.appeal);
  if (pick.length <= 2) return pick.reverse().map((s) => s.key);
  const [best, second, ...rest] = pick;
  return [second, ...rest, best].map((s) => s.key);
}

const slotWeight = (i: number, n: number) => (i === n - 1 && n > 1 ? 1.5 : i === 0 ? 1.2 : 1);

/** 0..1. Strong opener and closer count most; playing the fan request adds a bonus. */
export function setlistScore(keys: string[], pool: SetSong[], requestKey: string | null, slots: number) {
  if (!keys.length) return 0;
  let sum = 0, w = 0;
  keys.forEach((k, i) => {
    const s = pool.find((x) => x.key === k);
    const wt = slotWeight(i, keys.length);
    sum += (s?.appeal ?? 0) * wt;
    w += wt;
  });
  const fill = keys.length / Math.max(1, slots); // short sets disappoint
  const req = requestKey && keys.includes(requestKey) ? 0.08 : 0;
  return Math.max(0, Math.min(1, (sum / w / 100) * (0.7 + 0.3 * fill) + req));
}

export type Grade = "S" | "A" | "B" | "C" | "D";
export function gradeFor(score: number): Grade {
  return score >= 0.88 ? "S" : score >= 0.74 ? "A" : score >= 0.55 ? "B" : score >= 0.35 ? "C" : "D";
}
export const GRADE_LABEL: Record<Grade, string> = {
  S: "LEGENDARY SHOW", A: "CROWD WENT WILD", B: "SOLID SET", C: "ROUGH NIGHT", D: "TRAINWRECK",
};

/** Combined show score: 60% how you played, 40% what you played. */
export const showScore = (performance: number, setlist: number) => Math.max(0, Math.min(1, performance * 0.6 + setlist * 0.4));

/** Chance a brand-new song lands as the encore. */
export const debutChance = (performance: number) => Math.min(0.85, 0.3 + performance * 0.5);
