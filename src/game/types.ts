export type StatKey =
  | "fame"
  | "credibility"
  | "hype"
  | "cash"
  | "health"
  | "relationships"
  | "energy"
  | "fans";

export type Stats = Record<StatKey, number>;
export type Delta = Partial<Stats>;

export type GenreId = "pop" | "rap" | "rock" | "rnb" | "electronic" | "country" | "metal" | "indie";

export type PersonaId =
  | "underdog"
  | "party"
  | "chaos"
  | "plant"
  | "prodigy"
  | "heartthrob"
  | "grinder"
  | "recluse"
  | "viral";

export type ReleaseKind = "single" | "ep" | "lp" | "mixtape";

export type CrewId =
  | "manager1" | "manager2" | "manager3"
  | "stylist1" | "stylist2" | "stylist3"
  | "bus" | "lighting" | "pyro" | "security";

export type LockoutKind = "jail" | "rehab" | "dropped" | "cancelled";

export interface Lockout {
  kind: LockoutKind;
  until: number; // epoch ms
  bail?: number;
  reason: string;
}

export interface Song {
  id: string;
  title: string;
  seed: number;
  genre: GenreId;
  createdAt: number;
  source: "theme" | "release" | "live";
  releaseId?: string;
  appeal?: number; // for songs without a release (theme, debuted live)
}

export interface Release {
  id: string;
  kind: ReleaseKind;
  title: string;
  week: number;
  quality: number; // 0-100
  streams: number;
  earnings: number;
  fansGained: number;
  labelId: string | null;
  songId?: string;
  distributed?: string[];
}

export type LogType = "gig" | "release" | "scandal" | "milestone" | "label" | "crew" | "store" | "rival" | "event" | "daily" | "system";

export interface LogEntry {
  id: string;
  at: number;
  week: number;
  type: LogType;
  text: string;
}

export interface Career {
  id: string;
  name: string;
  genre: GenreId;
  persona: PersonaId;
  createdAt: number;
  week: number;
  stats: Stats;
  labelId: string | null;
  crew: Partial<Record<CrewId, boolean>>;
  releases: Release[];
  songs: Song[];
  queue: string[]; // song ids, locker order
  log: LogEntry[];
  lockout: Lockout | null;
  lastEnergyTick: number;
  daily: { lastClaim: string | null; streak: number; best: number };
  renameCount: number;
  totals: { gigs: number; earnings: number; sellouts: number; scandals: number; collabs: number; beefs: number };
  peakLevel: number;
  unlockedTours: string[];
  rivals: { weekKey: string; points: number; cooldowns: Record<string, number>; lastPaidWeek: string | null };
  pendingEvent: string | null;
  /** Times each setlist song has been played live (keys from game/setlist.ts). */
  setPlays?: Record<string, number>;
  lastSetlist?: string[];
  /** Lifetime reward points earned by playing. Spending is tracked on the server. */
  pointsEarned?: number;
  /** When royalties were last collected (set by the first release). */
  royaltiesAt?: number;
  quests?: import("./quests").QuestDay;
  /** First-time tutorial progress. Undefined/null = finished (or a career from before the tutorial). */
  tutorial?: { step: number } | null;
  /** A show that has started (energy spent) but not finished yet. */
  pendingShow?: import("./setlist").PendingShow | null;
}

export interface Celebration {
  id: string;
  kind: "level" | "tour" | "sellout" | "daily" | "rival";
  title: string;
  subtitle: string;
}

export interface Settings {
  volume: number; // 0..1
  muted: boolean;
  vibration: "off" | "low" | "med" | "high";
}

export interface Purchase {
  id: string;
  sku: string;
  name: string;
  price: number;
  at: number;
  simulated: boolean;
}

export interface Membership {
  removeTimers: boolean;
  premiumPass: boolean;
  vipBadge: boolean;
  purchases: Purchase[];
}
