// Daily quests and royalties. Pure helpers; the store applies them.
import type { Career } from "./types";
import { levelFor, levelMult, todayKey } from "./engine";
import { hashStr } from "./setlist";

// ---------------------------------------------------------------- daily quests

export type QuestKind = "gigs" | "gradeA" | "gradeS" | "sellout" | "release" | "request" | "debut" | "royalties" | "shop";
export interface Quest { kind: QuestKind; target: number; progress: number; points: number; cash: number; claimed: boolean }
export interface QuestDay { day: string; list: Quest[]; bonusClaimed: boolean }

const DEFS: Record<QuestKind, { label: (n: number) => string; emoji: string; points: number; cash: number; minLevel?: number; needsRelease?: boolean; target?: (lvl: number) => number }> = {
  gigs: { label: (n) => `Play ${n} shows`, emoji: "🎤", points: 20, cash: 150, target: (l) => Math.min(4, 2 + Math.floor(l / 3)) },
  gradeA: { label: () => "Score an A or better at a show", emoji: "🅰️", points: 25, cash: 200 },
  gradeS: { label: () => "Get an S rank (Legendary Show)", emoji: "👑", points: 35, cash: 300, minLevel: 2 },
  sellout: { label: () => "Sell out a show", emoji: "🎟️", points: 25, cash: 250 },
  release: { label: () => "Release a single, mixtape, EP or LP", emoji: "💿", points: 20, cash: 150 },
  request: { label: () => "Play the song the fans are shouting for", emoji: "🙋", points: 20, cash: 150, needsRelease: true },
  debut: { label: () => "Land a brand-new song in the encore", emoji: "✨", points: 30, cash: 250 },
  royalties: { label: () => "Collect your royalties", emoji: "💰", points: 15, cash: 0, needsRelease: true },
  shop: { label: () => "Buy a boost in the Shop", emoji: "🛒", points: 15, cash: 0 },
};
export const ALL_QUESTS_BONUS = 50;

export const questLabel = (q: Quest) => DEFS[q.kind].label(q.target);
export const questEmoji = (q: Quest) => DEFS[q.kind].emoji;

/** Three quests a day, the same for a given career and day. */
export function makeQuests(c: Career, day = todayKey()): QuestDay {
  const lvl = levelFor(c.stats.fame).level;
  const hasMusic = c.releases.length > 0;
  const pool = (Object.keys(DEFS) as QuestKind[]).filter((k) => (DEFS[k].minLevel ?? 1) <= lvl && (!DEFS[k].needsRelease || hasMusic));
  // Always include a show quest so every day starts with something easy to do.
  const picks: QuestKind[] = ["gigs"];
  let h = hashStr(c.id + day);
  const rest = pool.filter((k) => k !== "gigs");
  while (picks.length < 3 && rest.length) {
    const i = h % rest.length;
    picks.push(rest.splice(i, 1)[0]);
    h = hashStr(String(h));
  }
  const m = levelMult(lvl);
  return {
    day,
    bonusClaimed: false,
    list: picks.map((kind) => {
      const d = DEFS[kind];
      return { kind, target: d.target?.(lvl) ?? 1, progress: 0, points: d.points, cash: Math.round(d.cash * m), claimed: false };
    }),
  };
}

/** Today's quests, rolling over to a fresh set when the day changes. */
export function currentQuests(c: Career): QuestDay {
  const day = todayKey();
  return c.quests && c.quests.day === day ? c.quests : makeQuests(c, day);
}

// ---------------------------------------------------------------- royalties

export const ROYALTY_CAP_HOURS = 12;

/** Cash per hour from the back catalog. Newer, better releases earn more; old ones never drop below 20%. */
export function royaltyRate(c: Career, now = Date.now()) {
  let rate = 0;
  for (const r of c.releases) {
    const ageWeeks = Math.max(0, c.week - r.week);
    const fade = Math.max(0.2, 1 - ageWeeks / 40);
    rate += Math.max(100, r.earnings) * 0.06 * (0.5 + r.quality / 100) * fade;
  }
  void now;
  return rate;
}

/** Royalties waiting to be collected (capped so they reward checking in twice a day). */
export function royaltiesPending(c: Career, now = Date.now()) {
  if (!c.releases.length) return { cash: 0, hours: 0, full: false };
  const since = c.royaltiesAt ?? now;
  const hours = Math.min(ROYALTY_CAP_HOURS, Math.max(0, (now - since) / 36e5));
  return { cash: Math.floor(royaltyRate(c) * hours), hours, full: hours >= ROYALTY_CAP_HOURS };
}
