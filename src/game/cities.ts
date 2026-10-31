// Touring cities. Fans are local: you build a crowd city by city, each city has its own taste in music,
// travelling costs money and energy (short hops are cheap, flights aren't), and playing the same city
// too often wears out the market for a while. North America plus Toronto and London are in the base
// game; other regions come as packs (a Drop with a { type: "region" } item).
import type { Career, GenreId } from "./types";

export type RegionId = "core" | "uk" | "europe" | "asia" | "oceania" | "latam";
export interface Region { id: RegionId; name: string; emoji: string; blurb: string }
export const REGIONS: Region[] = [
  { id: "core", name: "North America + London", emoji: "🗽", blurb: "Where every career starts." },
  { id: "uk", name: "UK & Ireland", emoji: "🇬🇧", blurb: "Manchester, Glasgow, Dublin and Birmingham." },
  { id: "europe", name: "Europe", emoji: "🇪🇺", blurb: "Paris, Berlin, Amsterdam, Madrid, Stockholm and Milan." },
  { id: "asia", name: "Asia", emoji: "🌏", blurb: "Tokyo, Seoul, Singapore, Manila and Bangkok." },
  { id: "oceania", name: "Australia & NZ", emoji: "🦘", blurb: "Sydney, Melbourne, Brisbane, Perth and Auckland." },
  { id: "latam", name: "Latin America", emoji: "🌎", blurb: "Mexico City, São Paulo, Buenos Aires, Bogotá and Santiago." },
];

export interface City {
  id: string; name: string; country: string; region: RegionId; lat: number; lon: number;
  /** Genre multipliers on how well you draw here (1 = neutral). */
  taste: Partial<Record<GenreId, number>>;
  vibe: string;
}

export const CITIES: City[] = [
  { id: "new-york", name: "New York", country: "US", region: "core", lat: 40.71, lon: -74.0, taste: { rap: 1.15, indie: 1.1, pop: 1.1 }, vibe: "Everything, all at once." },
  { id: "los-angeles", name: "Los Angeles", country: "US", region: "core", lat: 34.05, lon: -118.24, taste: { pop: 1.2, electronic: 1.15, rap: 1.1 }, vibe: "Pop, beats and industry eyes." },
  { id: "chicago", name: "Chicago", country: "US", region: "core", lat: 41.88, lon: -87.63, taste: { rap: 1.1, electronic: 1.1, rock: 1.1 }, vibe: "Home of house music and big festival weekends." },
  { id: "nashville", name: "Nashville", country: "US", region: "core", lat: 36.16, lon: -86.78, taste: { country: 1.35, rock: 1.05, rap: 0.85 }, vibe: "Music City. Country rules here." },
  { id: "atlanta", name: "Atlanta", country: "US", region: "core", lat: 33.75, lon: -84.39, taste: { rap: 1.3, rnb: 1.25, country: 0.9 }, vibe: "Hip-hop and R&B capital." },
  { id: "austin", name: "Austin", country: "US", region: "core", lat: 30.27, lon: -97.74, taste: { indie: 1.25, country: 1.15, rock: 1.1 }, vibe: "Live music capital. Scouts everywhere." },
  { id: "seattle", name: "Seattle", country: "US", region: "core", lat: 47.61, lon: -122.33, taste: { rock: 1.2, indie: 1.2, rap: 0.9 }, vibe: "Rainy days, loud guitars." },
  { id: "denver", name: "Denver", country: "US", region: "core", lat: 39.74, lon: -104.99, taste: { indie: 1.1, electronic: 1.15, rock: 1.1 }, vibe: "Mountain amphitheaters and jam crowds." },
  { id: "boston", name: "Boston", country: "US", region: "core", lat: 42.36, lon: -71.06, taste: { rock: 1.15, indie: 1.1 }, vibe: "College town with loyal rock crowds." },
  { id: "las-vegas", name: "Las Vegas", country: "US", region: "core", lat: 36.17, lon: -115.14, taste: { electronic: 1.3, pop: 1.15, metal: 0.9 }, vibe: "Clubs, casinos and residencies." },
  { id: "miami", name: "Miami", country: "US", region: "core", lat: 25.76, lon: -80.19, taste: { electronic: 1.25, rap: 1.15, rnb: 1.1, country: 0.85 }, vibe: "Beach clubs and big beats." },
  { id: "toronto", name: "Toronto", country: "CA", region: "core", lat: 43.65, lon: -79.38, taste: { rap: 1.2, rnb: 1.2, indie: 1.05 }, vibe: "The 6ix. Huge R&B and rap scene." },
  { id: "london", name: "London", country: "UK", region: "core", lat: 51.51, lon: -0.13, taste: { indie: 1.2, rock: 1.15, electronic: 1.15, country: 0.8 }, vibe: "Where scenes are born." },

  { id: "manchester", name: "Manchester", country: "UK", region: "uk", lat: 53.48, lon: -2.24, taste: { indie: 1.25, rock: 1.2, electronic: 1.1 }, vibe: "Indie royalty." },
  { id: "glasgow", name: "Glasgow", country: "UK", region: "uk", lat: 55.86, lon: -4.25, taste: { rock: 1.25, indie: 1.15 }, vibe: "The loudest crowds in Britain." },
  { id: "dublin", name: "Dublin", country: "IE", region: "uk", lat: 53.35, lon: -6.26, taste: { rock: 1.15, indie: 1.15, pop: 1.05 }, vibe: "Pubs, singalongs and stadium rock." },
  { id: "birmingham", name: "Birmingham", country: "UK", region: "uk", lat: 52.49, lon: -1.89, taste: { metal: 1.35, rock: 1.1 }, vibe: "Birthplace of heavy metal." },

  { id: "paris", name: "Paris", country: "FR", region: "europe", lat: 48.86, lon: 2.35, taste: { electronic: 1.25, rap: 1.15, pop: 1.05 }, vibe: "French touch and big rap crowds." },
  { id: "berlin", name: "Berlin", country: "DE", region: "europe", lat: 52.52, lon: 13.4, taste: { electronic: 1.4, metal: 1.1, country: 0.8 }, vibe: "Techno never sleeps." },
  { id: "amsterdam", name: "Amsterdam", country: "NL", region: "europe", lat: 52.37, lon: 4.9, taste: { electronic: 1.3, indie: 1.05 }, vibe: "Dance music's home base." },
  { id: "madrid", name: "Madrid", country: "ES", region: "europe", lat: 40.42, lon: -3.7, taste: { pop: 1.15, rock: 1.05 }, vibe: "Late nights, huge singalongs." },
  { id: "stockholm", name: "Stockholm", country: "SE", region: "europe", lat: 59.33, lon: 18.07, taste: { pop: 1.25, metal: 1.15, electronic: 1.1 }, vibe: "Pop hit factory." },
  { id: "milan", name: "Milan", country: "IT", region: "europe", lat: 45.46, lon: 9.19, taste: { pop: 1.1, metal: 1.1, rock: 1.1 }, vibe: "Style first, then the show." },

  { id: "tokyo", name: "Tokyo", country: "JP", region: "asia", lat: 35.68, lon: 139.69, taste: { pop: 1.25, rock: 1.15, metal: 1.15, electronic: 1.1 }, vibe: "Devoted fans who know every word." },
  { id: "seoul", name: "Seoul", country: "KR", region: "asia", lat: 37.57, lon: 126.98, taste: { pop: 1.4, rnb: 1.15, rap: 1.1 }, vibe: "Pop perfection and fan chants." },
  { id: "singapore", name: "Singapore", country: "SG", region: "asia", lat: 1.35, lon: 103.82, taste: { pop: 1.15, electronic: 1.15 }, vibe: "A tour hub for the whole region." },
  { id: "manila", name: "Manila", country: "PH", region: "asia", lat: 14.6, lon: 120.98, taste: { pop: 1.2, rnb: 1.15, rock: 1.05 }, vibe: "Loves a boy band and a power ballad." },
  { id: "bangkok", name: "Bangkok", country: "TH", region: "asia", lat: 13.76, lon: 100.5, taste: { pop: 1.15, electronic: 1.1 }, vibe: "Festival nights in the heat." },

  { id: "sydney", name: "Sydney", country: "AU", region: "oceania", lat: -33.87, lon: 151.21, taste: { rock: 1.15, electronic: 1.1, indie: 1.1 }, vibe: "Harbour views, big crowds." },
  { id: "melbourne", name: "Melbourne", country: "AU", region: "oceania", lat: -37.81, lon: 144.96, taste: { indie: 1.25, rock: 1.1, electronic: 1.1 }, vibe: "The live music city of Australia." },
  { id: "brisbane", name: "Brisbane", country: "AU", region: "oceania", lat: -27.47, lon: 153.03, taste: { rock: 1.1, country: 1.1 }, vibe: "Sunshine and pub rock." },
  { id: "perth", name: "Perth", country: "AU", region: "oceania", lat: -31.95, lon: 115.86, taste: { rock: 1.1, electronic: 1.05 }, vibe: "Far from everywhere, hungry for shows." },
  { id: "auckland", name: "Auckland", country: "NZ", region: "oceania", lat: -36.85, lon: 174.76, taste: { rock: 1.05, pop: 1.1 }, vibe: "Small country, giant singalongs." },

  { id: "mexico-city", name: "Mexico City", country: "MX", region: "latam", lat: 19.43, lon: -99.13, taste: { pop: 1.15, rock: 1.15, metal: 1.1 }, vibe: "Stadiums that shake." },
  { id: "sao-paulo", name: "São Paulo", country: "BR", region: "latam", lat: -23.55, lon: -46.63, taste: { metal: 1.3, rock: 1.15, electronic: 1.1 }, vibe: "Metal heaven and massive festivals." },
  { id: "buenos-aires", name: "Buenos Aires", country: "AR", region: "latam", lat: -34.6, lon: -58.38, taste: { rock: 1.3, metal: 1.15 }, vibe: "The most passionate crowds on earth." },
  { id: "bogota", name: "Bogotá", country: "CO", region: "latam", lat: 4.71, lon: -74.07, taste: { pop: 1.15, electronic: 1.05, rap: 1.05 }, vibe: "High altitude, high energy." },
  { id: "santiago", name: "Santiago", country: "CL", region: "latam", lat: -33.45, lon: -70.67, taste: { rock: 1.15, metal: 1.2 }, vibe: "Rock and metal faithful." },
];

export const cityById = (id?: string | null) => CITIES.find((x) => x.id === id) ?? null;

/** A sensible hometown for careers that started before cities existed. */
export const DEFAULT_HOMETOWN: Record<GenreId, string> = {
  pop: "los-angeles", rap: "atlanta", rock: "new-york", rnb: "atlanta", electronic: "las-vegas", country: "nashville", metal: "chicago", indie: "seattle",
};

/** Regions this player can tour: the base game plus any region packs they own. */
export function regionOpen(region: RegionId, ownedRegions: string[]) {
  return region === "core" || ownedRegions.includes(region);
}

export function distanceKm(a: City, b: City) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)));
}

/** Travel cost: a van for short hops, flights for long ones; costs scale with your level (bigger crew and gear). */
export function travelCost(from: City, to: City, level: number) {
  const km = distanceKm(from, to);
  const cash = Math.round(((50 + km * 0.25) * Math.pow(1.7, Math.max(0, level - 1))) / 10) * 10;
  const energy = Math.min(20, 2 + Math.round(km / 600));
  const mode = km < 900 ? "🚐 Drive" : km < 4500 ? "✈️ Flight" : "🌍 Long-haul flight";
  return { km, cash, energy, mode };
}

const DAY = 864e5;
/** Shows played in a city in the last 2 days (the market needs a rest). */
export function recentPlays(c: Career, cityId: string, now = Date.now()) {
  return (c.cityRecent?.[cityId] ?? []).filter((t) => now - t < 2 * DAY).length;
}

/** How well you draw in a city, roughly 0.35–1.5 (1 = normal). */
export function cityDraw(c: Career, cityId: string, now = Date.now()) {
  const city = cityById(cityId);
  if (!city) return { factor: 1, local: 0, taste: 1, fatigue: 1, home: false };
  const local = c.cityFans?.[cityId] ?? 0;
  const global = Math.max(0, c.stats.fans);
  const localScore = Math.min(1, (local + global * 0.05) / (global * 0.25 + 20));
  const taste = city.taste[c.genre] ?? 1;
  const fatigue = Math.max(0.6, 1 - 0.1 * recentPlays(c, cityId, now));
  const home = c.hometown === cityId;
  const factor = (0.65 + 0.5 * localScore) * taste * fatigue * (home ? 1.1 : 1);
  return { factor, local, taste, fatigue, home };
}

export function drawLabel(f: number) {
  return f >= 1.2 ? { text: "Huge", color: "var(--success)" } : f >= 1 ? { text: "Strong", color: "var(--success)" } : f >= 0.8 ? { text: "Building", color: "var(--gold)" } : { text: "Unknown here", color: "var(--neon-pink)" };
}

/** Fans from a show: most stay in that city, some spread to nearby cities (under 800 km). */
export function spreadFans(c: Career, cityId: string, fans: number, now = Date.now()) {
  if (fans <= 0) return;
  const city = cityById(cityId);
  if (!city) return;
  const map = { ...(c.cityFans ?? {}) };
  map[cityId] = (map[cityId] ?? 0) + Math.round(fans * 0.8);
  for (const other of CITIES) {
    if (other.id === cityId || other.region !== city.region) continue;
    if (distanceKm(city, other) < 800) map[other.id] = (map[other.id] ?? 0) + Math.round(fans * 0.1);
  }
  c.cityFans = map;
  const recent = { ...(c.cityRecent ?? {}) };
  recent[cityId] = [...(recent[cityId] ?? []).filter((t) => now - t < 2 * DAY), now].slice(-6);
  c.cityRecent = recent;
}
