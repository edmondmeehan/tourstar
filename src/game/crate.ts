// Crate Digging: dig through old records for samples, then flip one into a release for a quality boost.
// Every record here is made up. Nothing is a real recording.
import type { GenreId } from "./types";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export interface Sample { id: string; name: string; rarity: Rarity; genres: GenreId[]; foundAt: number }

export const RARITY: Record<Rarity, { name: string; color: string; boost: number; weight: number; emoji: string }> = {
  common: { name: "Common", color: "#9AA0A6", boost: 4, weight: 60, emoji: "💿" },
  rare: { name: "Rare", color: "#1aa3ff", boost: 8, weight: 28, emoji: "📀" },
  epic: { name: "Epic", color: "#b46bff", boost: 12, weight: 10, emoji: "🎞️" },
  legendary: { name: "Legendary", color: "#f2c230", boost: 18, weight: 2, emoji: "🏆" },
};
export const CRATE_MAX = 12;
export const DIG_ENERGY = 3;
/** Quality bonus multiplier when the sample fits your genre. */
export const GENRE_FIT = 1.5;

const ADJ = ["Dusty", "Warped", "Mono", "Lost", "Crackly", "Late-Night", "Basement", "Sun-Faded", "Mislabeled", "Water-Stained", "Promo-Only", "Private Press"];
const SOURCES: { name: string; genres: GenreId[] }[] = [
  { name: "Soul 45", genres: ["rnb", "pop", "rap"] },
  { name: "Library LP", genres: ["indie", "electronic", "rap"] },
  { name: "Gospel Choir", genres: ["rnb", "pop", "country"] },
  { name: "Funk Break", genres: ["rap", "rnb", "electronic"] },
  { name: "Jazz Trio", genres: ["indie", "rnb", "rap"] },
  { name: "Disco 12-inch", genres: ["pop", "electronic"] },
  { name: "Film Score", genres: ["rock", "metal", "indie"] },
  { name: "Organ Session", genres: ["rock", "country", "rnb"] },
  { name: "Synth Demo", genres: ["electronic", "pop", "metal"] },
  { name: "Bluegrass Reel", genres: ["country", "indie"] },
  { name: "Prog Rock Side", genres: ["rock", "metal"] },
  { name: "Lounge Exotica", genres: ["indie", "electronic", "pop"] },
];
const PARTS = ["Intro", "Horn Stab", "Drum Break", "Bassline", "Vocal Chop", "Rhodes Loop", "String Swell", "Guitar Lick", "Choir Hit", "Outro Fade"];

function rand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roll one record from the crate. */
export function rollSample(seed = Math.floor(Math.random() * 1e9)): Sample {
  const r = rand(seed);
  const total = Object.values(RARITY).reduce((s, x) => s + x.weight, 0);
  let roll = r() * total;
  let rarity: Rarity = "common";
  for (const [k, v] of Object.entries(RARITY) as [Rarity, (typeof RARITY)[Rarity]][]) { if ((roll -= v.weight) < 0) { rarity = k; break; } }
  const src = SOURCES[Math.floor(r() * SOURCES.length)];
  const year = 1958 + Math.floor(r() * 32);
  const name = `${ADJ[Math.floor(r() * ADJ.length)]} ${src.name} ${PARTS[Math.floor(r() * PARTS.length)]} ('${String(year).slice(2)})`;
  return { id: `s${seed.toString(36)}${Date.now().toString(36)}`, name, rarity, genres: src.genres, foundAt: Date.now() };
}

export function sampleBoost(s: Sample, genre: GenreId) {
  const b = RARITY[s.rarity].boost;
  return Math.round(s.genres.includes(genre) ? b * GENRE_FIT : b);
}
