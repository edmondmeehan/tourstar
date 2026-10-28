// Cosmetics sold in Drops (Admin → Drops). Stage themes recolor the concert; titles and badges show
// next to the artist's name. None of these change reward points, odds or anything prize-related.

export interface StageTheme {
  id: string;
  name: string;
  emoji: string;
  /** Two light colors that alternate across the rig, the stage glow, and the sky gradient (3 stops). */
  a: number; b: number; glow: number; sky: [number, number, number];
}

export const STAGE_THEMES: StageTheme[] = [
  { id: "classic", name: "Classic", emoji: "🎤", a: 0xff42d8, b: 0x1aa3ff, glow: 0xf2c230, sky: [0x05040f, 0x140a2e, 0x2a0f45] },
  { id: "neon-tokyo", name: "Neon Tokyo", emoji: "🗼", a: 0x00f0ff, b: 0xff2e88, glow: 0xb46bff, sky: [0x020414, 0x0a1640, 0x2a0b4a] },
  { id: "desert-sunset", name: "Desert Sunset", emoji: "🌵", a: 0xff8a3d, b: 0xffd23f, glow: 0xff5e5e, sky: [0x1a0710, 0x5a1a2a, 0xc2542d] },
  { id: "arctic", name: "Arctic Night", emoji: "🧊", a: 0x9ef0ff, b: 0xffffff, glow: 0x5fb8ff, sky: [0x020812, 0x08223a, 0x12456b] },
  { id: "inferno", name: "Inferno", emoji: "🔥", a: 0xff3b1f, b: 0xffae00, glow: 0xff6a00, sky: [0x0c0202, 0x3a0705, 0x7a1408] },
  { id: "royal-gold", name: "Royal Gold", emoji: "👑", a: 0xf2c230, b: 0xfff3c4, glow: 0xffd23f, sky: [0x07050a, 0x1e1428, 0x3d2a14] },
  { id: "festival", name: "Festival Fields", emoji: "🌻", a: 0x7cff6b, b: 0xffe14d, glow: 0x47e0a0, sky: [0x03100a, 0x0c3020, 0x1d5a3a] },
  { id: "vaporwave", name: "Vaporwave", emoji: "🌴", a: 0xff71ce, b: 0x01cdfe, glow: 0xb967ff, sky: [0x0d0221, 0x261447, 0x541388] },
];
export const stageTheme = (id?: string | null) => STAGE_THEMES.find((t) => t.id === id) ?? STAGE_THEMES[0];

/** One thing inside a drop. Points and raffle entries are not allowed (enforced on the server too). */
export type DropItem =
  | { type: "stage"; id: string; name?: string }
  | { type: "title"; name: string }
  | { type: "badge"; emoji: string; name?: string }
  | { type: "cash"; amount: number }
  | { type: "energy"; amount: number }
  | { type: "gold"; amount: number }
  | { type: "venue"; id: string; name: string }
  | { type: "skin"; name: string; a: string; b: string; bg: string }
  | { type: "moves"; id: MoveId; name?: string; members?: number }
  | { type: "perk"; text: string };

// ------------------------------------------------------------------ app colors ("skins")

/** A whole-app color scheme: a = main accent (buttons, glows), b = second accent, bg = background tint. Hex colors. */
export interface Skin { name: string; a: string; b: string; bg: string }

export const SKIN_PRESETS: Skin[] = [
  { name: "Pure White", a: "#F5F7FF", b: "#9FD8FF", bg: "#0E1220" },
  { name: "Silver & Ice", a: "#D9E2F2", b: "#6FC3FF", bg: "#0B1422" },
  { name: "Millennium Gold", a: "#F5D36B", b: "#FFFFFF", bg: "#15110A" },
  { name: "Soul Train", a: "#FF9F1C", b: "#2EC4B6", bg: "#140D07" },
  { name: "Neon Red", a: "#FF3B5C", b: "#FFD166", bg: "#16070C" },
  { name: "Emerald", a: "#3DFFA2", b: "#7AE7FF", bg: "#06140F" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
export const validSkin = (s: unknown): s is Skin =>
  !!s && typeof s === "object" && ["a", "b", "bg"].every((k) => HEX.test(String((s as Record<string, unknown>)[k])));

/** Recolor the app with CSS variables (null = back to the TourStar default). */
export function applySkin(s: Skin | null | undefined) {
  const r = document.documentElement.style;
  const keys = ["--neon-pink", "--accent", "--electric", "--primary", "--glow-pink", "--glow-blue", "--gradient-hero", "--background", "--card", "--border"];
  if (!validSkin(s)) { keys.forEach((k) => r.removeProperty(k)); return; }
  r.setProperty("--neon-pink", s.a);
  r.setProperty("--accent", s.a);
  r.setProperty("--electric", s.b);
  r.setProperty("--primary", s.b);
  r.setProperty("--glow-pink", `0 0 30px color-mix(in oklab, ${s.a} 45%, transparent)`);
  r.setProperty("--glow-blue", `0 0 24px color-mix(in oklab, ${s.b} 45%, transparent)`);
  r.setProperty("--background", s.bg);
  r.setProperty("--card", `color-mix(in oklab, ${s.bg} 88%, ${s.b})`);
  r.setProperty("--border", `color-mix(in oklab, ${s.bg} 72%, ${s.a})`);
  r.setProperty("--gradient-hero", `linear-gradient(135deg, ${s.bg} 0%, color-mix(in oklab, ${s.bg} 82%, ${s.b}) 50%, color-mix(in oklab, ${s.bg} 88%, ${s.a}) 100%)`);
}

// ------------------------------------------------------------------ dance moves

export type MoveId = "classic" | "step" | "spin" | "point" | "jump" | "boyband";
export const MOVES: { id: MoveId; name: string; blurb: string }[] = [
  { id: "classic", name: "Classic", blurb: "Bob and wave." },
  { id: "step", name: "Step-Touch", blurb: "Side to side on every beat." },
  { id: "spin", name: "Spin", blurb: "A full turn every four beats." },
  { id: "point", name: "Point to the Crowd", blurb: "Hits the beat with a point." },
  { id: "jump", name: "Jump", blurb: "Up on every other beat, arms high." },
  { id: "boyband", name: "Boy Band 8-Count", blurb: "Step, pop, point, spin, freeze. Best in formation." },
];
export const moveName = (id?: string) => MOVES.find((m) => m.id === id)?.name ?? "Classic";

export const ITEM_TYPES: { type: DropItem["type"]; label: string }[] = [
  { type: "stage", label: "Stage theme" },
  { type: "title", label: "Title (shown under the artist name)" },
  { type: "badge", label: "Badge (emoji next to the name)" },
  { type: "cash", label: "Game cash" },
  { type: "energy", label: "Energy refill" },
  { type: "gold", label: "Bonus Gold Records" },
  { type: "venue", label: "Venue (unlocks a pack-only venue on the Tour page)" },
  { type: "skin", label: "App colors (recolors the whole game)" },
  { type: "moves", label: "Dance moves / formation" },
  { type: "perk", label: "Perk line (shown in the pack, e.g. merch discount)" },
];

export function itemLabel(i: DropItem) {
  switch (i.type) {
    case "stage": { const t = stageTheme(i.id); const n = i.name || t.name; return `${t.emoji} ${n}${/stage/i.test(n) ? "" : " stage"}`; }
    case "title": return `🏷️ "${i.name}" title`;
    case "badge": return `${i.emoji} ${i.name ?? "Badge"}`;
    case "cash": return `💵 $${i.amount.toLocaleString()} game cash`;
    case "energy": return `⚡ +${i.amount} energy`;
    case "gold": return `💿 ${i.amount.toLocaleString()} bonus Gold`;
    case "venue": return `🏟️ Play ${i.name || "a featured venue"}`;
    case "skin": return `🎨 ${i.name || "Custom"} app colors`;
    case "moves": return `🕺 ${i.name || moveName(i.id)} moves${(i.members ?? 1) > 1 ? ` · ${i.members}-piece formation` : ""}`;
    case "perk": return `🎁 ${i.text}`;
  }
}
