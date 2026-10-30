// Seasonal title screen: the synthwave sunset changes with the calendar.
//   New Year's    Dec 31 – Jan 2   (gold and silver, fireworks)
//   Valentine's   Feb 7 – Feb 14   (pink and red, floating hearts)
//   St. Patrick's Mar 14 – Mar 17  (green and gold, falling shamrocks)
//   Easter        the week up to Easter Sunday (pastels, spring petals)
//   4th of July   Jun 28 – Jul 4   (red, white and blue, fireworks)
//   Halloween     Oct 1 – Oct 31   (bats, jack-o'-lanterns on the rooftops, a blood-orange sun)
//   Harvest       Nov 1 – Nov 24   (Thanksgiving: amber sun, falling leaves)
//   Holidays      Nov 25 – Dec 30  (icy sun, snow, string lights on the rooftops)
// Admin → Tour events can pin a season or turn them off ("auto" follows the date).

export type SeasonId = "newyear" | "valentine" | "stpatrick" | "easter" | "july4" | "halloween" | "harvest" | "holiday";

export type Particle = "bats" | "leaves" | "snow" | "fireworks" | "hearts" | "shamrocks" | "petals";

export interface Season {
  id: SeasonId | "none";
  label: string;
  badge: string;
  sky: [string, string, string, string];
  sun: [string, string, string];
  glow: string;
  rail: string;
  rung: string;
  particles: Particle | null;
  roof: "pumpkins" | "lights" | null;
}

export const SEASONS: Record<SeasonId | "none", Season> = {
  none: {
    id: "none", label: "", badge: "",
    sky: ["#05040f", "#140a33", "#3b0f57", "#8a1a6b"], sun: ["#ffe46b", "#ff9a3d", "#ff2e88"], glow: "#ff4fd8",
    rail: "#4f8bff", rung: "#ff4fd8", particles: null, roof: null,
  },
  newyear: {
    id: "newyear", label: "New Year's", badge: "🎆 HAPPY NEW YEAR",
    sky: ["#020208", "#0b0b24", "#1d1640", "#3d2a5c"], sun: ["#fff6d6", "#f2c230", "#b8860b"], glow: "#f2c230",
    rail: "#d9d9ff", rung: "#f2c230", particles: "fireworks", roof: "lights",
  },
  valentine: {
    id: "valentine", label: "Valentine's Day", badge: "💘 LOVE SONGS WEEK",
    sky: ["#08030a", "#24081f", "#5a0f3c", "#b8235a"], sun: ["#ffd1e6", "#ff6fa8", "#d6164f"], glow: "#ff6fa8",
    rail: "#ff9ccc", rung: "#ff2e6d", particles: "hearts", roof: null,
  },
  stpatrick: {
    id: "stpatrick", label: "St. Patrick's Day", badge: "☘️ LUCK OF THE ROAD",
    sky: ["#020806", "#06201a", "#0d3d2c", "#1f6b3a"], sun: ["#fff3a6", "#f2c230", "#2fb36b"], glow: "#3ddc84",
    rail: "#f2c230", rung: "#3ddc84", particles: "shamrocks", roof: null,
  },
  easter: {
    id: "easter", label: "Easter", badge: "🌷 SPRING TOUR",
    sky: ["#0a0716", "#2a1a4a", "#5e3f8a", "#d98cc0"], sun: ["#fffbe0", "#ffd6a6", "#ff9fc8"], glow: "#ffc6e6",
    rail: "#a6e3ff", rung: "#c8a6ff", particles: "petals", roof: null,
  },
  july4: {
    id: "july4", label: "4th of July", badge: "🎆 INDEPENDENCE DAY",
    sky: ["#02040e", "#0a1440", "#1a2a7a", "#7a1f3d"], sun: ["#ffffff", "#ff8a8a", "#d61f3a"], glow: "#ff4f6d",
    rail: "#4f8bff", rung: "#ff4f6d", particles: "fireworks", roof: null,
  },
  halloween: {
    id: "halloween", label: "Halloween", badge: "🎃 HAUNTED TOUR",
    sky: ["#04030a", "#120726", "#2e0b3f", "#6b1d1d"], sun: ["#ffb347", "#ff6a00", "#7b1fa2"], glow: "#ff7a1a",
    rail: "#7cff6b", rung: "#ff7a1a", particles: "bats", roof: "pumpkins",
  },
  harvest: {
    id: "harvest", label: "Thanksgiving", badge: "🍂 HARVEST SEASON",
    sky: ["#07040a", "#1d0d1f", "#4a1a24", "#9c3d17"], sun: ["#ffe08a", "#f59e0b", "#c2410c"], glow: "#f59e0b",
    rail: "#f2c230", rung: "#ff8a3d", particles: "leaves", roof: null,
  },
  holiday: {
    id: "holiday", label: "Holidays", badge: "❄️ HAPPY HOLIDAYS",
    sky: ["#030612", "#0b1638", "#1f2a6b", "#5a3a8c"], sun: ["#f4fbff", "#9ed8ff", "#b46bff"], glow: "#9ed8ff",
    rail: "#9ed8ff", rung: "#ff4f6d", particles: "snow", roof: "lights",
  },
};

/** Easter Sunday (Gregorian), month 1-12. */
export function easterSunday(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

export function seasonFor(date: Date, setting = "auto"): Season {
  if (setting === "none") return SEASONS.none;
  if (setting in SEASONS && setting !== "auto") return SEASONS[setting as SeasonId];
  const m = date.getMonth() + 1, d = date.getDate();
  if ((m === 12 && d === 31) || (m === 1 && d <= 2)) return SEASONS.newyear;
  if (m === 2 && d >= 7 && d <= 14) return SEASONS.valentine;
  if (m === 3 && d >= 14 && d <= 17) return SEASONS.stpatrick;
  const easter = easterSunday(date.getFullYear());
  const day = new Date(date.getFullYear(), m - 1, d).getTime();
  if (day <= easter.getTime() && day >= easter.getTime() - 7 * 864e5) return SEASONS.easter;
  if ((m === 6 && d >= 28) || (m === 7 && d <= 4)) return SEASONS.july4;
  if (m === 10) return SEASONS.halloween;
  if (m === 11 && d <= 24) return SEASONS.harvest;
  if ((m === 11 && d >= 25) || (m === 12 && d <= 30)) return SEASONS.holiday;
  return SEASONS.none;
}

/** Admin list, in calendar order. */
export const SEASON_OPTIONS: { id: SeasonId; label: string; when: string }[] = [
  { id: "newyear", label: "🎆 New Year's", when: "Dec 31 – Jan 2" },
  { id: "valentine", label: "💘 Valentine's Day", when: "Feb 7 – 14" },
  { id: "stpatrick", label: "☘️ St. Patrick's Day", when: "Mar 14 – 17" },
  { id: "easter", label: "🌷 Easter", when: "the week up to Easter Sunday" },
  { id: "july4", label: "🎆 4th of July", when: "Jun 28 – Jul 4" },
  { id: "halloween", label: "🎃 Halloween", when: "Oct 1 – 31" },
  { id: "harvest", label: "🍂 Harvest (Thanksgiving)", when: "Nov 1 – 24" },
  { id: "holiday", label: "❄️ Holidays", when: "Nov 25 – Dec 30" },
];
