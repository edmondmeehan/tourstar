import type { CrewId, Delta, GenreId, PersonaId, ReleaseKind, Stats } from "./types";

export const STAT_META: Record<keyof Stats, { label: string; icon: string; max?: number; color: string }> = {
  fame: { label: "Fame", icon: "★", color: "var(--gold)" },
  credibility: { label: "Credibility", icon: "◆", max: 100, color: "var(--electric)" },
  hype: { label: "Hype", icon: "🔥", max: 100, color: "var(--neon-pink)" },
  cash: { label: "Cash", icon: "$", color: "var(--success)" },
  health: { label: "Health", icon: "♥", max: 100, color: "var(--danger)" },
  relationships: { label: "Relationships", icon: "☺", max: 100, color: "oklch(78% .14 200)" },
  energy: { label: "Energy", icon: "⚡", max: 100, color: "oklch(85% .17 110)" },
  fans: { label: "Fans", icon: "♪", color: "oklch(75% .2 300)" },
};

export const LEVELS = [
  { level: 1, name: "Basement Act", fame: 0 },
  { level: 2, name: "Local Buzz", fame: 150 },
  { level: 3, name: "Opening Act", fame: 700 },
  { level: 4, name: "Rising Star", fame: 2500 },
  { level: 5, name: "Headliner", fame: 9000 },
  { level: 6, name: "Superstar", fame: 30000 },
  { level: 7, name: "Legend", fame: 90000 },
] as const;

export const GENRES: Record<GenreId, { name: string; emoji: string; blurb: string; bonus: Delta; tempo: number; wave: OscillatorType; scale: number[] }> = {
  pop: { name: "Pop", emoji: "💖", blurb: "Hooks for days.", bonus: { hype: 5, fans: 20 }, tempo: 118, wave: "square", scale: [0, 2, 4, 7, 9] },
  rap: { name: "Rap", emoji: "🎤", blurb: "Bars and bravado.", bonus: { credibility: 5, hype: 3 }, tempo: 92, wave: "square", scale: [0, 3, 5, 7, 10] },
  rock: { name: "Rock", emoji: "🎸", blurb: "Loud and proud.", bonus: { credibility: 4, health: 5 }, tempo: 132, wave: "sawtooth", scale: [0, 3, 5, 7, 10] },
  rnb: { name: "R&B", emoji: "🌙", blurb: "Smooth operator.", bonus: { relationships: 8, hype: 2 }, tempo: 84, wave: "triangle", scale: [0, 2, 3, 7, 9, 10] },
  electronic: { name: "Electronic", emoji: "🎛️", blurb: "Drop the bass.", bonus: { hype: 8 }, tempo: 126, wave: "sawtooth", scale: [0, 2, 3, 5, 7, 8, 10] },
  country: { name: "Country", emoji: "🤠", blurb: "Trucks and heartbreak.", bonus: { relationships: 5, credibility: 3 }, tempo: 104, wave: "triangle", scale: [0, 2, 4, 7, 9] },
  metal: { name: "Metal", emoji: "🤘", blurb: "Shred everything.", bonus: { credibility: 8, relationships: -5 }, tempo: 160, wave: "sawtooth", scale: [0, 1, 3, 5, 7, 8, 10] },
  indie: { name: "Indie", emoji: "🌿", blurb: "You've never heard of them.", bonus: { credibility: 10, hype: -3 }, tempo: 110, wave: "triangle", scale: [0, 2, 4, 5, 7, 9, 11] },
};

export const BASE_STATS: Stats = {
  fame: 0,
  credibility: 30,
  hype: 10,
  cash: 500,
  health: 80,
  relationships: 60,
  energy: 100,
  fans: 10,
};

export const PERSONAS: Record<PersonaId, { name: string; emoji: string; blurb: string; mods: Delta; eventRate: number; tourEnergy?: number }> = {
  underdog: { name: "Underdog", emoji: "🐶", blurb: "Nobody believed in you. Respect is earned.", mods: { credibility: 20, cash: -300, relationships: 10 }, eventRate: 0.8 },
  party: { name: "Party Animal", emoji: "🎉", blurb: "Every night is the afterparty.", mods: { hype: 20, health: -15, relationships: 15 }, eventRate: 1.3 },
  chaos: { name: "Chaos Magnet", emoji: "🌪️", blurb: "Headlines follow you. So does trouble.", mods: { hype: 30, credibility: -10 }, eventRate: 1.6 },
  plant: { name: "Industry Plant", emoji: "🪴", blurb: "Mysteriously well funded.", mods: { cash: 4500, credibility: -25, fame: 50, hype: 10 }, eventRate: 1 },
  prodigy: { name: "Prodigy", emoji: "🎹", blurb: "Classically trained since age 4.", mods: { credibility: 25, hype: 5, health: -5 }, eventRate: 0.9 },
  heartthrob: { name: "Heartthrob", emoji: "😍", blurb: "The camera loves you.", mods: { fans: 200, hype: 15, relationships: -10 }, eventRate: 1.1 },
  grinder: { name: "Grinder", emoji: "💪", blurb: "Outwork everyone. Tours cost less energy.", mods: { health: 15, cash: 200, hype: -5 }, eventRate: 0.9, tourEnergy: 0.9 },
  recluse: { name: "Mysterious Recluse", emoji: "🕶️", blurb: "Less is more. Way more.", mods: { credibility: 30, hype: -10, relationships: -20 }, eventRate: 0.6 },
  viral: { name: "Viral Sensation", emoji: "📱", blurb: "One clip changed everything.", mods: { fans: 500, hype: 35, credibility: -15, fame: 30 }, eventRate: 1.2 },
};

export interface TourDef {
  id: string;
  name: string;
  emoji: string;
  level: number;
  energy: number;
  health: number;
  weeks: number;
  cost: number;
  pay: number;
  fame: number;
  fans: number;
  hype: number;
  credibility: number;
  capacity: number;
}

export const TOURS: TourDef[] = [
  { id: "open-mic", name: "Open Mic", emoji: "🎙️", level: 1, energy: 10, health: 1, weeks: 0, cost: 0, pay: 80, fame: 8, fans: 15, hype: 2, credibility: 1, capacity: 40 },
  { id: "bar-gig", name: "Bar Gig", emoji: "🍺", level: 1, energy: 15, health: 3, weeks: 1, cost: 0, pay: 300, fame: 20, fans: 40, hype: 3, credibility: 1, capacity: 150 },
  { id: "club-tour", name: "Club Tour", emoji: "🪩", level: 2, energy: 25, health: 6, weeks: 2, cost: 500, pay: 2500, fame: 70, fans: 250, hype: 6, credibility: 2, capacity: 800 },
  { id: "theater-tour", name: "Theater Tour", emoji: "🎭", level: 3, energy: 35, health: 10, weeks: 3, cost: 4000, pay: 15000, fame: 250, fans: 1500, hype: 8, credibility: 3, capacity: 2500 },
  { id: "arena-tour", name: "Arena Tour", emoji: "🏟️", level: 4, energy: 45, health: 14, weeks: 4, cost: 25000, pay: 90000, fame: 900, fans: 8000, hype: 10, credibility: 3, capacity: 18000 },
  { id: "stadium-tour", name: "Stadium Tour", emoji: "🌆", level: 5, energy: 60, health: 18, weeks: 6, cost: 120000, pay: 450000, fame: 3000, fans: 40000, hype: 12, credibility: 4, capacity: 60000 },
  { id: "stadium-encore", name: "Stadium Encore", emoji: "🌍", level: 6, energy: 75, health: 22, weeks: 8, cost: 500000, pay: 2000000, fame: 10000, fans: 200000, hype: 15, credibility: 5, capacity: 90000 },
];

export interface ReleaseDef {
  kind: ReleaseKind;
  name: string;
  emoji: string;
  level: number;
  cost: number;
  energy: number;
  weeks: number;
  fame: number;
  fans: number;
  credibility: number;
  hype: number;
  pay: number;
  blurb: string;
}

export const RELEASES: ReleaseDef[] = [
  { kind: "single", name: "Single", emoji: "💿", level: 1, cost: 200, energy: 15, weeks: 1, fame: 30, fans: 80, credibility: 2, hype: 6, pay: 300, blurb: "One track. Make it count." },
  { kind: "mixtape", name: "Mixtape", emoji: "📼", level: 1, cost: 0, energy: 20, weeks: 1, fame: 40, fans: 150, credibility: 4, hype: 4, pay: 0, blurb: "Free on the streets. Pure cred." },
  { kind: "ep", name: "EP", emoji: "🎚️", level: 2, cost: 1500, energy: 30, weeks: 3, fame: 120, fans: 400, credibility: 5, hype: 8, pay: 2500, blurb: "Five tracks of proof." },
  { kind: "lp", name: "LP", emoji: "📀", level: 3, cost: 10000, energy: 50, weeks: 6, fame: 600, fans: 3000, credibility: 10, hype: 12, pay: 25000, blurb: "The full statement." },
];

export interface LabelDef {
  id: string;
  name: string;
  emoji: string;
  level: number;
  boost: number; // earnings + fans multiplier
  share: number; // label's cut of earnings
  advance: number;
  blurb: string;
}

export const LABELS: LabelDef[] = [
  { id: "basement", name: "Basement Records", emoji: "🧺", level: 1, boost: 0.2, share: 0.1, advance: 1000, blurb: "Run out of a laundromat. They get you." },
  { id: "neon-tide", name: "Neon Tide Music", emoji: "🌊", level: 2, boost: 0.6, share: 0.25, advance: 10000, blurb: "Cool indie with real distribution." },
  { id: "velvet-crown", name: "Velvet Crown", emoji: "👑", level: 4, boost: 1.2, share: 0.4, advance: 100000, blurb: "Prestige major. Radio on speed dial." },
  { id: "megaphone", name: "Megaphone Global", emoji: "📣", level: 5, boost: 2.0, share: 0.55, advance: 1000000, blurb: "The machine. Everywhere at once." },
];

export interface CrewDef {
  id: CrewId;
  name: string;
  role: "Manager" | "Stylist" | "Gear";
  emoji: string;
  level: number;
  cost: number;
  effect: string;
  tier?: number;
}

export const CREW: CrewDef[] = [
  { id: "manager1", name: "Cousin Vinny", role: "Manager", emoji: "🧢", level: 1, cost: 1000, effect: "+10% gig pay, fewer bad outcomes", tier: 1 },
  { id: "manager2", name: "Hustle Mgmt", role: "Manager", emoji: "💼", level: 3, cost: 25000, effect: "+25% gig pay, smarter choices", tier: 2 },
  { id: "manager3", name: "Mega Mgmt Group", role: "Manager", emoji: "🏢", level: 5, cost: 250000, effect: "+45% gig pay, crisis control", tier: 3 },
  { id: "stylist1", name: "Thrift Stylist", role: "Stylist", emoji: "🧥", level: 1, cost: 600, effect: "+10% hype gains", tier: 1 },
  { id: "stylist2", name: "Runway Stylist", role: "Stylist", emoji: "👗", level: 3, cost: 15000, effect: "+25% hype gains", tier: 2 },
  { id: "stylist3", name: "Couture House", role: "Stylist", emoji: "💎", level: 5, cost: 150000, effect: "+50% hype gains", tier: 3 },
  { id: "bus", name: "Tour Bus", role: "Gear", emoji: "🚌", level: 2, cost: 8000, effect: "-25% tour energy cost" },
  { id: "lighting", name: "Lighting Rig", role: "Gear", emoji: "💡", level: 3, cost: 20000, effect: "+20% tour fame" },
  { id: "pyro", name: "Pyro Package", role: "Gear", emoji: "🎆", level: 4, cost: 80000, effect: "+15% sellout chance, +3 hype per tour" },
  { id: "security", name: "Security Team", role: "Gear", emoji: "🛡️", level: 4, cost: 50000, effect: "-50% tour health loss, keeps you out of trouble" },
];

export interface StoreItem {
  id: string;
  name: string;
  category: "VIP" | "Merch" | "Records" | "Tickets" | "Wellness";
  emoji: string;
  price: number;
  level: number;
  effects: Delta;
  blurb: string;
}

export const STORE: StoreItem[] = [
  { id: "vip-mg", name: "VIP Meet & Greet Package", category: "VIP", emoji: "🤝", price: 2500, level: 1, effects: { fans: 300, relationships: 10, fame: 20 }, blurb: "Photos, hugs, signed laminate." },
  { id: "vip-soundcheck", name: "Soundcheck Party VIP", category: "VIP", emoji: "🎧", price: 8000, level: 2, effects: { hype: 15, fans: 600 }, blurb: "Superfans watch you warm up." },
  { id: "vip-platinum", name: "Platinum Experience", category: "VIP", emoji: "🏆", price: 50000, level: 4, effects: { fame: 500, hype: 20, fans: 5000 }, blurb: "Side-stage, after-party, the works." },
  { id: "merch-tee", name: "Tour Tee Drop", category: "Merch", emoji: "👕", price: 400, level: 1, effects: { fans: 60, hype: 3 }, blurb: "Black tee. Dates on the back." },
  { id: "merch-hoodie", name: "Hoodie Bundle", category: "Merch", emoji: "🧥", price: 1200, level: 1, effects: { fans: 180, hype: 5 }, blurb: "Oversized. Sells out every time." },
  { id: "rec-vinyl", name: "Limited Vinyl Pressing", category: "Records", emoji: "📀", price: 1500, level: 1, effects: { credibility: 8, fans: 100 }, blurb: "Colored wax, numbered sleeves." },
  { id: "rec-cassette", name: "Cassette Run", category: "Records", emoji: "📼", price: 350, level: 1, effects: { credibility: 4, hype: 2 }, blurb: "Retro and very collectible." },
  { id: "tix-frontrow", name: "Front Row Tickets", category: "Tickets", emoji: "🎟️", price: 300, level: 1, effects: { credibility: 3, relationships: 8 }, blurb: "Take Mom to see a legend." },
  { id: "tix-festival", name: "Festival Weekend Pass", category: "Tickets", emoji: "🎪", price: 900, level: 1, effects: { hype: 6, relationships: 6, credibility: 2 }, blurb: "Network in the VIP tent." },
  { id: "well-energy", name: "Energy Drink Case", category: "Wellness", emoji: "⚡", price: 150, level: 1, effects: { energy: 30, health: -2 }, blurb: "+30 energy. Probably fine." },
  { id: "well-spa", name: "Spa Day", category: "Wellness", emoji: "🧖", price: 800, level: 1, effects: { health: 25, relationships: 3 }, blurb: "Cucumbers on eyes. Phone off." },
];

export interface RivalDef {
  id: string;
  name: string;
  genre: GenreId;
  power: number;
  emoji: string;
}

export const RIVALS: RivalDef[] = [
  { id: "lil-static", name: "Lil Static", genre: "rap", power: 1.2, emoji: "⚡" },
  { id: "neon-saint", name: "Neon Saint", genre: "electronic", power: 1.35, emoji: "😇" },
  { id: "velvet-riot", name: "Velvet Riot", genre: "rock", power: 1.0, emoji: "🥀" },
  { id: "dj-overdraft", name: "DJ Overdraft", genre: "electronic", power: 0.7, emoji: "💸" },
  { id: "kasey-gravel", name: "Kasey Gravel", genre: "country", power: 1.1, emoji: "🐴" },
  { id: "moxie-blue", name: "Moxie Blue", genre: "pop", power: 1.5, emoji: "💙" },
  { id: "grimwald", name: "Grimwald", genre: "metal", power: 0.9, emoji: "💀" },
  { id: "paper-hearts", name: "Paper Hearts", genre: "indie", power: 0.8, emoji: "📃" },
  { id: "juno-vale", name: "Juno Vale", genre: "rnb", power: 1.25, emoji: "🌙" },
  { id: "tre-bandz", name: "Tre Bandz", genre: "rap", power: 1.05, emoji: "💰" },
  { id: "sable", name: "SABLE", genre: "pop", power: 1.4, emoji: "🖤" },
];

export const GOSSIP = [
  "{rival} spotted leaving a studio at 4am with a mystery producer",
  "Sources say {name} turned down a reality show offer",
  "{rival} and {rival2} reportedly not speaking after awards show seating mix-up",
  "Is {name} the next big thing? Mom says yes",
  "{rival} sued over a sample from a 1970s polka record",
  "Fans camp out three days early for {rival}'s pop-up",
  "{name}'s tour rider allegedly demands only blue M&Ms",
  "Label execs fight over {name} in parking lot (allegedly)",
  "{rival2} drops surprise album at 3am, internet melts",
  "Bassist quits {rival}'s band to open a juice bar",
  "{name} seen thrifting in Brooklyn, sells out vintage store",
  "Insiders: {rival} lip-synced the whole festival set",
  "{name} trending after fan's cover goes viral",
  "Please & Thank You VIP packages for {rival} sell out in 4 minutes",
];

export const DAILY_MILESTONES: Record<number, { label: string; reward: Delta }> = {
  3: { label: "3-day streak", reward: { cash: 1500, hype: 5 } },
  7: { label: "7-day streak", reward: { cash: 5000, fame: 50, energy: 50 } },
  14: { label: "14-day streak", reward: { cash: 15000, fame: 150, credibility: 5 } },
  30: { label: "30-day streak", reward: { cash: 50000, fame: 500, fans: 2000 } },
};

export const RENAME_COST = 50000;
export const ENERGY_REGEN_MS = 36_000; // 1 energy every 36s (full in 1h)
export const MAX_ENERGY = 100;
