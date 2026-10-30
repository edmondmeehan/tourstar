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
  /** A real recording from the AI studio (ElevenLabs), when the player made one. */
  audioUrl?: string;
  ai?: "pending" | "failed";
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
  /** Stadium announcer clip (AI voice) and the name it says. */
  announcerUrl?: string;
  announcerFor?: string;
  /** Equipped cosmetics from Drops. */
  style?: {
    stage?: string; title?: string; badge?: string;
    /** Whole-app colors from a pack. */
    skin?: import("./cosmetics").Skin;
    /** Performer dance moves and how many performers (formation). */
    moves?: { id: import("./cosmetics").MoveId; members: number; match?: boolean };
  };
  /** Create-your-look: the artist's pixel look and the outfits bought with game cash. */
  look?: import("./looks").Look;
  ownedLooks?: string[];
  /** Lifestyle buys (cosmetic): ids from LUXURIES. */
  luxury?: string[];
  /** Drop purchases whose cash/energy has been added to this career (each only once). */
  claimedDrops?: string[];
  queue: string[]; // song ids, locker order
  log: LogEntry[];
  lockout: Lockout | null;
  lastEnergyTick: number;
  daily: { lastClaim: string | null; streak: number; best: number };
  renameCount: number;
  totals: { gigs: number; earnings: number; sellouts: number; scandals: number; collabs: number; beefs: number };
  peakLevel: number;
  unlockedTours: string[];
  /** Tours whose challenge was skipped with a Promoter's Pass (or grandfathered for careers from before challenges). */
  tourPasses?: string[];
  /** Gold energy refills used today: { day: 'YYYY-MM-DD', n }. */
  refills?: { day: string; n: number };
  rivals: { weekKey: string; points: number; cooldowns: Record<string, number>; lastPaidWeek: string | null };
  pendingEvent: string | null;
  /** Times each setlist song has been played live (keys from game/setlist.ts). */
  setPlays?: Record<string, number>;
  lastSetlist?: string[];
  /** Difficulty picked for the last show (remembered as the default). */
  lastDifficulty?: import("./difficulty").Difficulty;
  /** S ranks earned on Hard. */
  hardS?: number;
  /** Lifetime reward points earned by playing. Spending is tracked on the server. */
  pointsEarned?: number;
  /** Shows/releases that earned points today (daily cap). */
  pointActs?: { day: string; n: number };
  /** Energy taken from rest and store items today (daily cap). */
  bonusEnergy?: { day: string; n: number };
  /** When royalties were last collected (set by the first release). */
  royaltiesAt?: number;
  quests?: import("./quests").QuestDay;
  /** First-time tutorial progress. Undefined/null = finished (or a career from before the tutorial). */
  tutorial?: { step: number } | null;
  /** Drum School: best grade per lesson, the lesson in progress, and rewarded lessons today. */
  drums?: { best: Record<string, import("./setlist").Grade>; active?: string | null; day?: string; n?: number };
  /** Crate Digging: samples found, and the last day the free dig was used. */
  samples?: import("./crate").Sample[];
  crateDay?: string;
  /** A show that has started (energy spent) but not finished yet. */
  pendingShow?: import("./setlist").PendingShow | null;
  /** Promoter gig offer on the table, and when the next one may arrive. */
  offer?: import("./offers").GigOffer | null;
  offerNext?: number;
  offersTaken?: number;
  /** Progress in the current tour event. */
  event?: { id: string; shows: number; claimed: boolean };
  eventsDone?: number;
  /** Festival bill (you + friends): goals already claimed this week. */
  festival?: { week: string; claimed: number };
  /** Achievements claimed (id → when). Carries over when a Legend retires. */
  achievements?: Record<string, number>;
  /** League history seen on this career. */
  leagues?: { promotions: number; best: number; lastWeek?: string };
  /** Retired careers that came before this one (Hall of Fame). Each adds a lasting fame bonus. */
  legacy?: { count: number; names: string[]; fameBonus: number };
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
  /** Rhythm timing: how late (ms) this player's taps land after the beat they hear (headphones, slow screens). */
  tapOffsetMs?: number;
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
