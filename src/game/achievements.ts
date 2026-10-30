// Achievements: long-term goals with a one-time reward (game cash, energy and hype; never reward
// points, which stay tied to daily play). Progress is read straight from the career.
import type { Career, Delta } from "./types";
import { LESSONS } from "./drums";

export interface Achievement {
  id: string;
  emoji: string;
  name: string;
  about: string;
  group: "Shows" | "Music" | "Career" | "Habits" | "Skills" | "Community";
  target: number;
  progress: (c: Career) => number;
  /** Reward size: 1 small, 2 medium, 3 big. */
  size: 1 | 2 | 3;
}

const best = (c: Career, grades: string[]) => Object.values(c.drums?.best ?? {}).filter((g) => grades.includes(g)).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: "gig1", emoji: "🎤", name: "First Night", about: "Play your first show.", group: "Shows", target: 1, progress: (c) => c.totals.gigs, size: 1 },
  { id: "gig25", emoji: "🚐", name: "Road Dog", about: "Play 25 shows.", group: "Shows", target: 25, progress: (c) => c.totals.gigs, size: 2 },
  { id: "gig100", emoji: "🛣️", name: "Never Stops Touring", about: "Play 100 shows.", group: "Shows", target: 100, progress: (c) => c.totals.gigs, size: 3 },
  { id: "sell1", emoji: "🎟️", name: "Sold Out", about: "Sell out a show.", group: "Shows", target: 1, progress: (c) => c.totals.sellouts, size: 1 },
  { id: "sell25", emoji: "🔥", name: "Hottest Ticket in Town", about: "Sell out 25 shows.", group: "Shows", target: 25, progress: (c) => c.totals.sellouts, size: 3 },
  { id: "hards", emoji: "💀", name: "Flawless on Hard", about: "Get an S on Hard.", group: "Skills", target: 1, progress: (c) => c.hardS ?? 0, size: 2 },
  { id: "hards10", emoji: "👑", name: "Hard Mode Royalty", about: "Get 10 S grades on Hard.", group: "Skills", target: 10, progress: (c) => c.hardS ?? 0, size: 3 },
  { id: "drum5", emoji: "🥁", name: "In the Pocket", about: "Pass 5 Drum School lessons with an A or S.", group: "Skills", target: 5, progress: (c) => best(c, ["A", "S"]), size: 2 },
  { id: "drumall", emoji: "🎖️", name: "Drum School Graduate", about: "Pass every Drum School lesson with an A or S.", group: "Skills", target: LESSONS.length, progress: (c) => best(c, ["A", "S"]), size: 3 },
  { id: "rel1", emoji: "💿", name: "Debut", about: "Drop your first release.", group: "Music", target: 1, progress: (c) => c.releases.length, size: 1 },
  { id: "rel10", emoji: "📀", name: "Discography", about: "Drop 10 releases.", group: "Music", target: 10, progress: (c) => c.releases.length, size: 2 },
  { id: "songs10", emoji: "🎶", name: "Songwriter", about: "Have 10 songs of your own.", group: "Music", target: 10, progress: (c) => c.songs.length, size: 2 },
  { id: "lv3", emoji: "⭐", name: "Opening Act", about: "Reach level 3.", group: "Career", target: 3, progress: (c) => c.peakLevel, size: 1 },
  { id: "lv5", emoji: "🌟", name: "Headliner", about: "Reach level 5.", group: "Career", target: 5, progress: (c) => c.peakLevel, size: 2 },
  { id: "lv7", emoji: "🏛️", name: "Legend", about: "Reach level 7.", group: "Career", target: 7, progress: (c) => c.peakLevel, size: 3 },
  { id: "fans100k", emoji: "🙌", name: "100K Fans", about: "Reach 100,000 fans.", group: "Career", target: 100000, progress: (c) => c.stats.fans, size: 2 },
  { id: "million", emoji: "💰", name: "Millionaire", about: "Earn $1,000,000 from shows.", group: "Career", target: 1000000, progress: (c) => c.totals.earnings, size: 3 },
  { id: "label", emoji: "🏷️", name: "Signed", about: "Sign with a record label.", group: "Career", target: 1, progress: (c) => (c.labelId || c.log.some((l) => l.type === "label") ? 1 : 0), size: 1 },
  { id: "streak7", emoji: "📅", name: "Week Streak", about: "Claim your daily reward 7 days in a row.", group: "Habits", target: 7, progress: (c) => Math.max(c.daily.best, c.daily.streak), size: 2 },
  { id: "streak30", emoji: "🗓️", name: "Month Streak", about: "Claim your daily reward 30 days in a row.", group: "Habits", target: 30, progress: (c) => Math.max(c.daily.best, c.daily.streak), size: 3 },
  { id: "offers5", emoji: "📞", name: "Promoter's Favorite", about: "Take 5 promoter gig offers.", group: "Habits", target: 5, progress: (c) => c.offersTaken ?? 0, size: 2 },
  { id: "league1", emoji: "⬆️", name: "Moving Up", about: "Get promoted in your weekly league.", group: "Community", target: 1, progress: (c) => c.leagues?.promotions ?? 0, size: 2 },
  { id: "league6", emoji: "🏟️", name: "Stadium League", about: "Reach the top league division.", group: "Community", target: 6, progress: (c) => c.leagues?.best ?? 1, size: 3 },
  { id: "event1", emoji: "🎪", name: "Special Engagement", about: "Earn a tour event collectible.", group: "Community", target: 1, progress: (c) => c.eventsDone ?? 0, size: 2 },
];

/** Cash grows with your level so rewards stay meaningful. */
export function achievementReward(a: Achievement, level: number): Delta {
  const base = [0, 800, 2500, 7000][a.size];
  return { cash: Math.round(base * Math.pow(2.2, Math.max(0, level - 1))), energy: [0, 10, 20, 30][a.size], hype: [0, 2, 4, 8][a.size] };
}

/** How many achievements are done but not yet claimed (for the menu badge). */
export function unclaimedCount(c: Career) {
  return ACHIEVEMENTS.filter((a) => !c.achievements?.[a.id] && a.progress(c) >= a.target).length;
}
