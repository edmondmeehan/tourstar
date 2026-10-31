// Optional zip / postal code. Used to suggest a hometown and to show real shows and presales near the
// player. Worked out on the device from built-in tables (no outside lookup service); only the code, the
// country, the state/province and the nearest game city are saved, and only for signed-in players.
import { create } from "zustand";
import { CITIES, distanceKm, type City } from "../game/cities";
import { supabase, useCloud } from "./cloud";

export interface Place { postal: string; country: "US" | "CA" | "GB"; area: string; lat: number; lon: number }

// US: 3-digit zip prefix ranges → state, with a rough center point for each state.
const US: [number, number, string][] = [
  [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"],
  [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"], [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"],
  [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"], [370, 385, "TN"], [386, 397, "MS"],
  [398, 399, "GA"], [400, 427, "KY"], [430, 458, "OH"], [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"],
  [550, 567, "MN"], [569, 569, "DC"], [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"],
  [660, 679, "KS"], [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"],
  [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"],
  [900, 961, "CA"], [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
];
const STATE: Record<string, [number, number]> = {
  MA: [42.3, -71.8], RI: [41.7, -71.5], NH: [43.7, -71.6], ME: [45.3, -69.2], VT: [44.0, -72.7], CT: [41.6, -72.7], NJ: [40.2, -74.6],
  NY: [42.0, -74.5], PA: [40.9, -77.8], DE: [39.0, -75.5], DC: [38.9, -77.0], MD: [39.0, -76.8], VA: [37.5, -78.8], WV: [38.6, -80.6],
  NC: [35.6, -79.4], SC: [33.9, -80.9], GA: [32.7, -83.4], FL: [28.1, -81.6], AL: [32.8, -86.8], TN: [35.9, -86.4], MS: [32.7, -89.7],
  KY: [37.5, -85.3], OH: [40.3, -82.8], IN: [39.9, -86.3], MI: [43.3, -84.5], IA: [42.0, -93.5], WI: [44.6, -89.9], MN: [46.3, -94.3],
  SD: [44.4, -100.2], ND: [47.5, -100.5], MT: [47.0, -109.6], IL: [40.0, -89.2], MO: [38.4, -92.5], KS: [38.5, -98.4], NE: [41.5, -99.8],
  LA: [31.1, -92.0], AR: [34.9, -92.4], OK: [35.6, -97.5], TX: [31.0, -97.6], CO: [39.0, -105.5], WY: [43.0, -107.6], ID: [44.4, -114.6],
  UT: [39.3, -111.7], AZ: [34.2, -111.7], NM: [34.4, -106.1], NV: [38.5, -116.9], CA: [36.8, -119.4], HI: [20.8, -156.3], OR: [43.9, -120.6],
  WA: [47.4, -120.5], AK: [61.4, -152.3],
};
// Canada: first letter of the postal code → province (Toronto has its own letter, M).
const CA: Record<string, [string, number, number]> = {
  A: ["NL", 47.6, -52.7], B: ["NS", 44.7, -63.6], C: ["PE", 46.2, -63.1], E: ["NB", 46.0, -66.6], G: ["QC", 46.8, -71.2], H: ["QC", 45.5, -73.6],
  J: ["QC", 45.9, -72.5], K: ["ON", 45.0, -76.0], L: ["ON", 43.6, -79.7], M: ["ON", 43.65, -79.38], N: ["ON", 43.0, -81.2], P: ["ON", 46.5, -81.0],
  R: ["MB", 49.9, -97.1], S: ["SK", 52.1, -106.7], T: ["AB", 51.0, -114.1], V: ["BC", 49.3, -123.1], X: ["NT", 62.5, -114.4], Y: ["YT", 60.7, -135.1],
};
// UK: a few postcode areas with their own city; everything else is placed in England.
const GB: Record<string, [string, number, number]> = {
  M: ["Manchester", 53.48, -2.24], G: ["Glasgow", 55.86, -4.25], B: ["Birmingham", 52.49, -1.89], EH: ["Edinburgh", 55.95, -3.19],
  L: ["Liverpool", 53.41, -2.98], LS: ["Leeds", 53.8, -1.55], CF: ["Cardiff", 51.48, -3.18], BT: ["Belfast", 54.6, -5.93], BS: ["Bristol", 51.45, -2.59],
};
const LONDON = /^(E|EC|N|NW|SE|SW|W|WC)\d/;

/** Read a US zip, Canadian postal code or UK postcode. Returns null if it doesn't look like one. */
export function parsePostal(raw: string): Place | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (/^\d{5}(-\d{4})?$/.test(s)) {
    const p = Number(s.slice(0, 3));
    const st = US.find(([a, b]) => p >= a && p <= b)?.[2];
    if (!st) return null;
    const [lat, lon] = STATE[st];
    return { postal: s.slice(0, 5), country: "US", area: st, lat, lon };
  }
  if (/^[ABCEGHJ-NPRSTVXY]\d[A-Z] ?\d[A-Z]\d$/.test(s)) {
    const [prov, lat, lon] = CA[s[0]];
    return { postal: s.replace(/^(...) ?(...)$/, "$1 $2"), country: "CA", area: prov, lat, lon };
  }
  if (/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(s)) {
    const area = s.match(/^[A-Z]+/)![0];
    if (LONDON.test(s)) return { postal: s, country: "GB", area: "London", lat: 51.51, lon: -0.13 };
    const hit = GB[area] ?? GB[area[0]];
    const [name, lat, lon] = hit ?? ["England", 52.5, -1.5];
    return { postal: s, country: "GB", area: name, lat, lon };
  }
  return null;
}

/** The closest game city to a place (optionally only base-game cities, for a hometown). */
export function nearestCity(p: Place, coreOnly = false): City {
  const here = { lat: p.lat, lon: p.lon } as City;
  return CITIES.filter((c) => !coreOnly || c.region === "core").reduce((best, c) => (distanceKm(here, c) < distanceKm(here, best) ? c : best));
}

const KEY = "ts_postal";
export const usePostal = create<{ postal: string | null }>(() => {
  let v: string | null = null;
  try { v = localStorage.getItem(KEY); } catch { /* private mode */ }
  return { postal: v };
});

/** Save (or clear with null) the player's postal code: on the device, and on their account when signed in. */
export async function savePostal(raw: string | null): Promise<{ ok: boolean; message: string }> {
  const place = raw ? parsePostal(raw) : null;
  if (raw && !place) return { ok: false, message: "That doesn't look like a US zip, Canadian postal code or UK postcode." };
  try { if (place) localStorage.setItem(KEY, place.postal); else localStorage.removeItem(KEY); } catch { /* fine */ }
  usePostal.setState({ postal: place?.postal ?? null });
  await syncPostal();
  return { ok: true, message: place ? `Saved. Nearest tour city: ${nearestCity(place).name}.` : "Removed your postal code." };
}

/** Upload the saved code to the account (or delete it there). Called on sign-in too. */
export async function syncPostal() {
  if (!supabase || !useCloud.getState().session) return;
  const postal = usePostal.getState().postal;
  const place = postal ? parsePostal(postal) : null;
  if (!place) { await supabase.rpc("set_my_location", { p_postal: null, p_country: null, p_area: null, p_city: null }); return; }
  await supabase.rpc("set_my_location", { p_postal: place.postal, p_country: place.country, p_area: place.area, p_city: nearestCity(place).id });
}

let started = false;
export function startPostal() {
  if (started) return;
  started = true;
  if (useCloud.getState().session && usePostal.getState().postal) void syncPostal();
  useCloud.subscribe((s, p) => { if (s.session?.user.id && s.session.user.id !== p.session?.user.id && usePostal.getState().postal) void syncPostal(); });
}
