// Seasonal title screen: the synthwave sunset changes with the calendar.
//   Halloween     Oct 1 – Oct 31   (bats, jack-o'-lanterns on the rooftops, a blood-orange sun)
//   Harvest       Nov 1 – Nov 24   (Thanksgiving: amber sun, falling leaves)
//   Holidays      Nov 25 – Jan 1   (icy sun, snow, string lights on the rooftops)
// Admin → Tour events can pin a season or turn them off ("auto" follows the date).

export type SeasonId = "halloween" | "harvest" | "holiday";

export interface Season {
  id: SeasonId | "none";
  label: string;
  badge: string;
  sky: [string, string, string, string];
  sun: [string, string, string];
  glow: string;
  rail: string;
  rung: string;
  particles: "bats" | "leaves" | "snow" | null;
  roof: "pumpkins" | "lights" | null;
}

export const SEASONS: Record<SeasonId | "none", Season> = {
  none: {
    id: "none", label: "", badge: "",
    sky: ["#05040f", "#140a33", "#3b0f57", "#8a1a6b"], sun: ["#ffe46b", "#ff9a3d", "#ff2e88"], glow: "#ff4fd8",
    rail: "#4f8bff", rung: "#ff4fd8", particles: null, roof: null,
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

export function seasonFor(date: Date, setting = "auto"): Season {
  if (setting === "none") return SEASONS.none;
  if (setting in SEASONS && setting !== "auto") return SEASONS[setting as SeasonId];
  const m = date.getMonth() + 1, d = date.getDate();
  if (m === 10) return SEASONS.halloween;
  if (m === 11 && d <= 24) return SEASONS.harvest;
  if ((m === 11 && d >= 25) || m === 12 || (m === 1 && d === 1)) return SEASONS.holiday;
  return SEASONS.none;
}
