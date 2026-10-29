// Create-your-look: a pixel-art artist built from layered parts on a 24×40 grid.
// Everyone starts with a genre look and can pick skin tone, body and hair color for free.
// More outfits, hair and accessories come from game cash, level-ups, Gold drops, artist packs and real merch.
// Looks are cosmetic only: they never change pay, fame or points.
import type { GenreId } from "./types";

export type Slot = "hair" | "top" | "bottom" | "shoes" | "acc" | "held";
export type Body = "slim" | "avg" | "broad";

export interface Look {
  skin: number; // index into SKIN_TONES
  body: Body;
  hairColor: number; // index into HAIR_COLORS
  hair: string; top: string; bottom: string; shoes: string; acc: string; held: string;
}

export const SKIN_TONES = ["#F9D7C0", "#F1C27D", "#E0AC69", "#C68642", "#A0663D", "#8D5524", "#6B3E26", "#4A2C1F"];
export const HAIR_COLORS = ["#1B1B1F", "#3B2416", "#6A4224", "#8C3B1E", "#E6C36A", "#F2EEDC", "#C4372B", "#FF6FB5", "#3E7BFF", "#3DD68C", "#9B5CFF", "#9AA0A6"];
export const BODIES: { id: Body; name: string }[] = [{ id: "slim", name: "Slim" }, { id: "avg", name: "Medium" }, { id: "broad", name: "Broad" }];

export type Source = "starter" | "cash" | "level" | "gold" | "merch";
export interface LookItem {
  id: string; slot: Slot; name: string; style: string;
  /** Main and accent colors (hair uses the chosen hair color instead). */
  c?: string; c2?: string;
  source: Source;
  /** Game cash price (source "cash"). */
  price?: number;
  /** Level needed to buy (cash) or that unlocks it for free (level). */
  level?: number;
}

const I = (id: string, slot: Slot, name: string, style: string, source: Source, extra: Partial<LookItem> = {}): LookItem => ({ id, slot, name, style, source, ...extra });

export const LOOK_ITEMS: LookItem[] = [
  // Hair (color comes from the player's hair color)
  I("hair-short", "hair", "Short", "short", "starter"),
  I("hair-long", "hair", "Long", "long", "starter"),
  I("hair-buzz", "hair", "Buzz", "buzz", "starter"),
  I("hair-curly", "hair", "Curls", "curly", "starter"),
  I("hair-afro", "hair", "Afro", "afro", "starter"),
  I("hair-braids", "hair", "Braids", "braids", "starter"),
  I("hair-locs", "hair", "Locs", "locs", "starter"),
  I("hair-bun", "hair", "Top Bun", "bun", "starter"),
  I("hair-bald", "hair", "Shaved", "bald", "starter"),
  I("hair-pigtails", "hair", "Pigtails", "pigtails", "cash", { price: 3000 }),
  I("hair-mohawk", "hair", "Mohawk", "mohawk", "cash", { price: 4000, level: 2 }),
  I("hair-mullet", "hair", "Mullet", "mullet", "cash", { price: 6000, level: 2 }),
  I("hair-emo", "hair", "Side Fringe", "emo", "cash", { price: 12000, level: 3 }),
  I("hair-spikes", "hair", "Spikes", "spikes", "cash", { price: 30000, level: 4 }),
  I("hair-slick", "hair", "Slicked Back", "slick", "cash", { price: 75000, level: 5 }),
  I("hair-frosted", "hair", "Frosted Tips", "frosted", "gold"),
  I("hair-big-afro", "hair", "Big Afro & Pick", "bigafro", "gold", { c: "#1E1E24", c2: "#F2C230" }),

  // Tops
  I("top-tee-white", "top", "White Tee", "tee", "starter", { c: "#F2F2F2" }),
  I("top-tee-black", "top", "Black Tee", "tee", "starter", { c: "#1E1E24" }),
  I("top-band-tee", "top", "Band Tee", "bandtee", "starter", { c: "#2B2B33", c2: "#FF42D8" }),
  I("top-tank", "top", "Tank Top", "tank", "starter", { c: "#E8E8E8" }),
  I("top-hoodie", "top", "Gray Hoodie", "hoodie", "starter", { c: "#6B6F7A", c2: "#555963" }),
  I("top-flannel", "top", "Red Flannel", "flannel", "starter", { c: "#B3282D", c2: "#1E1E24" }),
  I("top-leather", "top", "Leather Jacket", "leather", "starter", { c: "#1A1A1F", c2: "#55555F" }),
  I("top-sparkle", "top", "Sparkle Top", "sparkle", "starter", { c: "#FF5FB7", c2: "#FFFFFF" }),
  I("top-jersey", "top", "Jersey", "jersey", "starter", { c: "#2453C9", c2: "#FFFFFF" }),
  I("top-silk", "top", "Silk Shirt", "silk", "starter", { c: "#6B3FA0", c2: "#9B6FD0" }),
  I("top-cardigan", "top", "Cardigan", "cardigan", "starter", { c: "#C9A15A", c2: "#7A5A2A" }),
  I("top-denim", "top", "Denim Jacket", "denim", "cash", { c: "#3D6BA8", c2: "#2B4E80", price: 3000 }),
  I("top-bomber", "top", "Bomber Jacket", "bomber", "cash", { c: "#3E5A2E", c2: "#C46A1F", price: 15000, level: 3 }),
  I("top-blazer", "top", "Velvet Blazer", "blazer", "cash", { c: "#7A1F3D", c2: "#F2F2F2", price: 45000, level: 4 }),
  I("top-headliner", "top", "Headliner Jacket", "tour", "level", { c: "#111827", c2: "#F2C230", level: 5 }),
  I("top-legend", "top", "Legend Coat", "coat", "level", { c: "#F2C230", c2: "#7A5A10", level: 7 }),
  I("top-white-suit", "top", "White Suit Jacket", "suit", "gold", { c: "#F7F7F2", c2: "#C8C8C0" }),
  I("top-sequin", "top", "Gold Sequins", "sequin", "gold", { c: "#E5B83A", c2: "#FFF3B0" }),
  I("top-cape", "top", "Stage Cape", "cape", "gold", { c: "#8E1BD1", c2: "#F2C230" }),
  I("top-crate-tee", "top", "Oversized Crate Tee", "bigtee", "gold", { c: "#1E1E24", c2: "#FF9F1C" }),
  I("top-soul-jacket", "top", "Soul Track Jacket", "tour", "gold", { c: "#FF9F1C", c2: "#2EC4B6" }),
  I("top-ts-hoodie", "top", "TourStar Hoodie", "hoodie", "merch", { c: "#111111", c2: "#F2C230" }),

  // Bottoms
  I("bottom-jeans", "bottom", "Blue Jeans", "jeans", "starter", { c: "#3D5F9A" }),
  I("bottom-black-jeans", "bottom", "Black Jeans", "jeans", "starter", { c: "#222228" }),
  I("bottom-ripped", "bottom", "Ripped Jeans", "ripped", "starter", { c: "#4A6FA8" }),
  I("bottom-cargo", "bottom", "Cargo Pants", "cargo", "starter", { c: "#5E6648" }),
  I("bottom-track", "bottom", "Track Pants", "track", "starter", { c: "#1E1E24", c2: "#F2F2F2" }),
  I("bottom-skirt", "bottom", "Black Skirt", "skirt", "starter", { c: "#1E1E24" }),
  I("bottom-pink-skirt", "bottom", "Pink Skirt", "skirt", "starter", { c: "#FF7FC4" }),
  I("bottom-shorts", "bottom", "Denim Shorts", "shorts", "cash", { c: "#4A6FA8", price: 1500 }),
  I("bottom-plaid", "bottom", "Plaid Skirt", "plaid", "cash", { c: "#9C1F2A", c2: "#1E1E24", price: 4000 }),
  I("bottom-leather", "bottom", "Leather Pants", "leather", "cash", { c: "#141418", price: 12000, level: 3 }),
  I("bottom-white", "bottom", "White Suit Pants", "jeans", "gold", { c: "#F7F7F2" }),
  I("bottom-gold", "bottom", "Gold Pants", "leather", "gold", { c: "#D9A92E" }),

  // Shoes
  I("shoes-white", "shoes", "White Sneakers", "sneakers", "starter", { c: "#F2F2F2", c2: "#D0D0D0" }),
  I("shoes-red", "shoes", "Red Sneakers", "sneakers", "starter", { c: "#D23A3A", c2: "#F2F2F2" }),
  I("shoes-boots", "shoes", "Black Boots", "boots", "starter", { c: "#1A1A1F" }),
  I("shoes-cowboy", "shoes", "Cowboy Boots", "cowboy", "starter", { c: "#7A4A22", c2: "#A86A32" }),
  I("shoes-hightops", "shoes", "High-Tops", "hightops", "cash", { c: "#2453C9", c2: "#F2F2F2", price: 2500 }),
  I("shoes-platforms", "shoes", "Platforms", "platforms", "cash", { c: "#FF42D8", c2: "#1E1E24", price: 15000, level: 3 }),
  I("shoes-stage", "shoes", "Stadium Boots", "boots", "level", { c: "#B8BCC8", c2: "#F2C230", level: 6 }),
  I("shoes-gold", "shoes", "Gold Kicks", "sneakers", "gold", { c: "#E5B83A", c2: "#FFFFFF" }),
  I("shoes-white-platforms", "shoes", "White Platform Boots", "platforms", "gold", { c: "#F7F7F2", c2: "#C8C8C0" }),

  // Accessories
  I("acc-none", "acc", "Nothing", "none", "starter"),
  I("acc-shades", "acc", "Shades", "shades", "starter", { c: "#111111" }),
  I("acc-beanie", "acc", "Beanie", "beanie", "starter", { c: "#B3282D" }),
  I("acc-cap", "acc", "Backwards Cap", "cap", "starter", { c: "#1E1E24", c2: "#F2F2F2" }),
  I("acc-cowboy-hat", "acc", "Cowboy Hat", "cowboyhat", "starter", { c: "#8A5A2B" }),
  I("acc-chain", "acc", "Gold Chain", "chain", "starter", { c: "#F2C230" }),
  I("acc-headphones", "acc", "Headphones", "headphones", "starter", { c: "#1E1E24", c2: "#FF42D8" }),
  I("acc-bandana", "acc", "Bandana", "bandana", "cash", { c: "#C4372B", price: 1000 }),
  I("acc-flower", "acc", "Hair Flower", "flower", "cash", { c: "#FF7FC4", c2: "#F2C230", price: 800 }),
  I("acc-star-shades", "acc", "Star Shades", "starshades", "gold", { c: "#FF42D8" }),
  I("acc-silver-shades", "acc", "Silver Shades", "shades", "gold", { c: "#B8C4D6" }),
  I("acc-silver-chain", "acc", "Silver Chain", "chain", "gold", { c: "#D6DAE2" }),
  I("acc-round-specs", "acc", "Round Specs", "roundspecs", "gold", { c: "#1E1E24", c2: "#9FD8FF" }),
  I("acc-crown", "acc", "Legend Crown", "crown", "level", { c: "#F2C230", level: 7 }),

  // Held
  I("held-none", "held", "Nothing", "none", "starter"),
  I("held-mic", "held", "Microphone", "mic", "starter", { c: "#9AA0A6" }),
  I("held-electric", "held", "Electric Guitar", "guitar", "starter", { c: "#C4372B", c2: "#F2F2F2" }),
  I("held-acoustic", "held", "Acoustic Guitar", "acoustic", "starter", { c: "#C8873A", c2: "#5A3A1A" }),
  I("held-sticks", "held", "Drumsticks", "sticks", "starter", { c: "#E3C28A" }),
  I("held-bass", "held", "Bass", "guitar", "cash", { c: "#2453C9", c2: "#F2F2F2", price: 5000, level: 2 }),
  I("held-keytar", "held", "Keytar", "keytar", "cash", { c: "#FF42D8", c2: "#F2F2F2", price: 20000, level: 3 }),
  I("held-flying-v", "held", "Flying V", "flyingv", "cash", { c: "#1A1A1F", c2: "#B8BCC8", price: 80000, level: 5 }),
  I("held-gold-mic", "held", "Gold Mic", "mic", "gold", { c: "#F2C230" }),
  I("held-headset", "held", "Headset Mic", "headset", "gold", { c: "#1E1E24", c2: "#9AA0A6" }),
  I("held-gold-sticks", "held", "Gold Drumsticks", "sticks", "gold", { c: "#F2C230" }),
  I("held-legend-guitar", "held", "Legend Guitar", "guitar", "level", { c: "#F2C230", c2: "#FFFFFF", level: 7 }),
];
export const lookItem = (id: string) => LOOK_ITEMS.find((i) => i.id === id);

/** The look each genre starts with (all starter items are free for everyone, whatever the genre). */
export const GENRE_LOOKS: Record<GenreId, Pick<Look, "hair" | "top" | "bottom" | "shoes" | "acc" | "held">> = {
  pop: { hair: "hair-long", top: "top-sparkle", bottom: "bottom-pink-skirt", shoes: "shoes-white", acc: "acc-shades", held: "held-mic" },
  rap: { hair: "hair-short", top: "top-jersey", bottom: "bottom-track", shoes: "shoes-red", acc: "acc-chain", held: "held-mic" },
  rock: { hair: "hair-long", top: "top-leather", bottom: "bottom-ripped", shoes: "shoes-boots", acc: "acc-none", held: "held-electric" },
  rnb: { hair: "hair-curly", top: "top-silk", bottom: "bottom-black-jeans", shoes: "shoes-white", acc: "acc-chain", held: "held-mic" },
  electronic: { hair: "hair-buzz", top: "top-hoodie", bottom: "bottom-cargo", shoes: "shoes-white", acc: "acc-headphones", held: "held-none" },
  country: { hair: "hair-short", top: "top-flannel", bottom: "bottom-jeans", shoes: "shoes-cowboy", acc: "acc-cowboy-hat", held: "held-acoustic" },
  metal: { hair: "hair-long", top: "top-band-tee", bottom: "bottom-black-jeans", shoes: "shoes-boots", acc: "acc-none", held: "held-electric" },
  indie: { hair: "hair-bun", top: "top-cardigan", bottom: "bottom-jeans", shoes: "shoes-white", acc: "acc-beanie", held: "held-acoustic" },
};

export function defaultLook(genre: GenreId, seed = 0): Look {
  return { skin: seed % SKIN_TONES.length, body: "avg", hairColor: (seed >> 3) % 4, ...GENRE_LOOKS[genre] };
}

/** Fill in anything missing (older saves, removed items) so drawing never fails. */
export function normalizeLook(l: Partial<Look> | undefined, genre: GenreId): Look {
  const d = defaultLook(genre);
  const out = { ...d, ...(l ?? {}) } as Look;
  (["hair", "top", "bottom", "shoes", "acc", "held"] as Slot[]).forEach((s) => { if (lookItem(out[s])?.slot !== s) out[s] = d[s]; });
  if (!(out.skin >= 0 && out.skin < SKIN_TONES.length)) out.skin = 0;
  if (!(out.hairColor >= 0 && out.hairColor < HAIR_COLORS.length)) out.hairColor = 0;
  if (!BODIES.some((b) => b.id === out.body)) out.body = "avg";
  return out;
}

// ---------------------------------------------------------------- drawing

export interface Px { x: number; y: number; w: number; h: number; c: string }
export const GRID_W = 24, GRID_H = 40;

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("")}`;
};

/**
 * The look as pixel rectangles on the 24×40 grid, back to front.
 * `arms: false` leaves out arms and the held item (the concert draws those itself so they can move).
 */
export function buildAvatar(look: Look, opts: { arms?: boolean; held?: boolean } = {}): Px[] {
  const arms = opts.arms !== false, withHeld = opts.held !== false && arms;
  const out: Px[] = [];
  const r = (x: number, y: number, w: number, h: number, c: string) => out.push({ x, y, w, h, c });
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[0];
  const hairC = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0];
  const hairDark = shade(hairC, -0.3);
  const top = lookItem(look.top)!, bottom = lookItem(look.bottom)!, shoes = lookItem(look.shoes)!, acc = lookItem(look.acc)!, held = lookItem(look.held)!, hair = lookItem(look.hair)!;
  const tW = look.body === "slim" ? 8 : look.body === "broad" ? 12 : 10;
  const tL = 12 - tW / 2, tR = tL + tW; // torso spans [tL, tR)
  const lW = look.body === "broad" ? 5 : 4; // leg width
  const legL = 12 - lW - (look.body === "broad" ? 0 : 0), legR = 12;

  // Hair behind the head
  switch (hair.style) {
    case "long": r(6, 5, 2, 13, hairC); r(16, 5, 2, 13, hairC); break;
    case "mullet": r(7, 9, 10, 7, hairC); break;
    case "locs": for (let i = 0; i < 5; i++) { r(5 + (i % 2), 5 + i * 0, 1, 14, i % 2 ? hairDark : hairC); } r(6, 5, 2, 13, hairC); r(16, 5, 2, 13, hairC); r(17, 5, 1, 14, hairDark); break;
    case "braids": r(6, 6, 2, 13, hairC); r(16, 6, 2, 13, hairC); for (let y = 7; y < 19; y += 3) { r(6, y, 2, 1, hairDark); r(16, y, 2, 1, hairDark); } break;
    case "afro": r(4, 1, 16, 12, hairC); break;
    case "bigafro": r(2, 0, 20, 14, hairC); break;
    case "pigtails": r(3, 7, 4, 7, hairC); r(17, 7, 4, 7, hairC); break;
  }
  // Cape goes behind the body
  if (top.style === "cape") r(tL - 2, 14, tW + 4, 20, top.c2 ?? "#F2C230");

  // Head and face
  r(8, 5, 8, 8, skin);
  r(10, 8, 1, 1, "#1B1B1F"); r(13, 8, 1, 1, "#1B1B1F");
  r(11, 11, 2, 1, shade(skin, -0.25));
  r(11, 13, 2, 1, skin); // neck

  // Legs / bottoms (y 26–35)
  const bC = bottom.c ?? "#3D5F9A";
  const legs = (c: string) => { r(legL, 26, lW, 10, c); r(legR, 26, lW, 10, c); };
  switch (bottom.style) {
    case "skirt": case "plaid":
      legs(skin); r(tL - 1, 26, tW + 2, 5, bC);
      if (bottom.style === "plaid") { for (let x = tL - 1; x < tR + 1; x += 3) r(x, 26, 1, 5, bottom.c2 ?? "#111"); r(tL - 1, 28, tW + 2, 1, bottom.c2 ?? "#111"); }
      break;
    case "shorts": legs(skin); r(legL, 26, lW, 4, bC); r(legR, 26, lW, 4, bC); break;
    default:
      legs(bC);
      if (bottom.style === "ripped") { r(legL + 1, 30, 2, 1, skin); r(legR + 1, 32, 2, 1, skin); }
      if (bottom.style === "cargo") { r(legL, 30, 2, 2, shade(bC, -0.25)); r(legR + lW - 2, 30, 2, 2, shade(bC, -0.25)); }
      if (bottom.style === "track") { r(legL, 26, 1, 10, bottom.c2 ?? "#fff"); r(legR + lW - 1, 26, 1, 10, bottom.c2 ?? "#fff"); }
      if (bottom.style === "leather") { r(legL + 1, 27, 1, 8, shade(bC, 0.25)); r(legR + 1, 27, 1, 8, shade(bC, 0.25)); }
      if (bottom.style === "jeans") { r(legR, 26, 1, 10, shade(bC, -0.15)); }
  }

  // Shoes (y 36–38)
  const sC = shoes.c ?? "#F2F2F2", s2 = shoes.c2 ?? shade(sC, -0.2);
  const foot = (x: number) => {
    switch (shoes.style) {
      case "boots": r(x, 33, lW, 5, sC); r(x - 1, 37, lW + 1, 2, sC); if (shoes.c2) r(x, 34, lW, 1, s2); break;
      case "cowboy": r(x, 32, lW, 6, sC); r(x, 33, lW, 1, s2); r(x - 1, 37, lW + 2, 2, sC); r(x + lW, 38, 1, 1, "#3A2410"); break;
      case "platforms": r(x - 1, 36, lW + 1, 1, sC); r(x - 1, 37, lW + 1, 2, s2); break;
      case "hightops": r(x, 34, lW, 3, sC); r(x - 1, 37, lW + 1, 1, sC); r(x - 1, 38, lW + 1, 1, s2); break;
      default: r(x - 1, 36, lW + 1, 2, sC); r(x - 1, 38, lW + 1, 1, s2);
    }
  };
  foot(legL); foot(legR);

  // Torso / top (y 14–25)
  const c1 = top.c ?? "#F2F2F2", c2 = top.c2 ?? shade(c1, -0.2);
  const coatLen = top.style === "coat" ? 6 : 0;
  r(tL, 14, tW, 12 + coatLen, c1);
  switch (top.style) {
    case "tank": r(tL, 14, 1, 3, skin); r(tR - 1, 14, 1, 3, skin); r(11, 14, 2, 2, skin); break;
    case "bandtee": r(tL + 2, 17, tW - 4, 4, c2); r(tL + 3, 18, tW - 6, 2, c1); break;
    case "hoodie": r(10, 14, 4, 2, c2); r(tL + 2, 21, tW - 4, 3, c2); if (top.source === "merch") { r(11, 17, 2, 2, "#F2C230"); r(10, 18, 4, 1, "#F2C230"); } break;
    case "flannel": for (let x = tL; x < tR; x += 3) r(x, 14, 1, 12, c2); r(tL, 18, tW, 1, c2); r(tL, 22, tW, 1, c2); break;
    case "leather": r(12, 14, 1, 12, c2); r(tL + 1, 14, 2, 4, c2); r(tR - 3, 14, 2, 4, c2); break;
    case "sparkle": for (let y = 15; y < 25; y += 2) for (let x = tL + ((y >> 1) % 2); x < tR; x += 2) r(x, y, 1, 1, c2); break;
    case "jersey": r(tL, 14, tW, 1, c2); r(10, 17, 4, 5, c2); r(11, 18, 2, 3, c1); break;
    case "silk": r(11, 14, 2, 3, skin); r(tL + 1, 16, 1, 9, c2); break;
    case "cardigan": r(11, 14, 2, 12, shade(c1, -0.35)); for (let y = 16; y < 25; y += 3) r(12, y, 1, 1, c2); break;
    case "denim": r(tL, 14, tW, 2, c2); r(12, 14, 1, 12, c2); r(tL + 1, 17, 3, 2, c2); r(tR - 4, 17, 3, 2, c2); break;
    case "bomber": r(tL, 24, tW, 2, c2); r(tL, 14, tW, 1, c2); r(12, 15, 1, 9, shade(c1, -0.3)); break;
    case "blazer": case "suit": r(11, 14, 2, 6, c2); r(10, 14, 1, 5, shade(c1, -0.25)); r(13, 14, 1, 5, shade(c1, -0.25)); if (top.style === "suit") r(12, 15, 1, 4, "#1E1E24"); break;
    case "tour": r(12, 14, 1, 12, c2); r(tL + 2, 17, 2, 2, c2); r(tL, 24, tW, 2, c2); break;
    case "coat": r(12, 14, 1, 18, c2); r(10, 14, 1, 4, c2); r(13, 14, 1, 4, c2); break;
    case "sequin": for (let y = 15; y < 26; y += 2) for (let x = tL + ((y >> 1) % 2); x < tR; x += 2) r(x, y, 1, 1, c2); break;
    case "cape": r(11, 14, 2, 2, c2); break;
    case "bigtee": r(tL - 1, 24, tW + 2, 3, c1); r(10, 17, 4, 4, c2); r(11, 18, 2, 2, c1); r(11, 18, 1, 1, c2); break;
  }

  // Arms (static pose: down at the sides)
  if (arms) {
    const sleeve = top.style === "tank" ? 0 : top.style === "bigtee" ? 6 : ["tee", "bandtee", "sparkle", "jersey"].includes(top.style) ? 4 : 11;
    for (const ax of [tL - 2, tR]) {
      if (sleeve) r(ax, 14, 2, sleeve, c1);
      if (sleeve < 11) r(ax, 14 + sleeve, 2, 11 - sleeve, skin);
      r(ax, 25, 2, 2, skin);
    }
  }

  // Hair on top of the head
  switch (hair.style) {
    case "short": r(7, 3, 10, 3, hairC); r(7, 6, 1, 3, hairC); r(16, 6, 1, 3, hairC); break;
    case "long": r(7, 3, 10, 3, hairC); r(7, 6, 1, 2, hairC); r(16, 6, 1, 2, hairC); break;
    case "buzz": r(8, 4, 8, 2, hairC); break;
    case "curly": r(6, 2, 12, 4, hairC); r(6, 6, 2, 4, hairC); r(16, 6, 2, 4, hairC); for (let x = 6; x < 18; x += 2) r(x, 2, 1, 1, hairDark); break;
    case "afro": r(6, 1, 12, 4, hairC); for (let x = 5; x < 19; x += 3) r(x, 2, 1, 1, hairDark); break;
    case "bigafro": {
      r(5, 0, 14, 5, hairC); for (let x = 3; x < 21; x += 3) r(x, 1 + (x % 2), 1, 1, hairDark);
      // the pick: comb teeth in the hair, handle sticking out
      const p1 = hair.c ?? "#1E1E24", p2 = hair.c2 ?? "#F2C230";
      r(16, 1, 3, 1, p1); r(16, 2, 1, 2, p1); r(18, 2, 1, 2, p1); r(17, 0, 1, 1, p2); r(19, 0, 2, 2, p2);
      break;
    }
    case "braids": case "locs": r(7, 3, 10, 3, hairC); r(8, 3, 1, 3, hairDark); r(11, 3, 1, 3, hairDark); r(14, 3, 1, 3, hairDark); break;
    case "bun": r(8, 4, 8, 2, hairC); r(10, 1, 4, 3, hairC); break;
    case "pigtails": r(7, 3, 10, 3, hairC); break;
    case "mohawk": r(8, 4, 8, 1, shade(skin, -0.12)); r(11, 0, 2, 5, hairC); break;
    case "mullet": r(7, 3, 10, 3, hairC); break;
    case "emo": r(7, 3, 10, 3, hairC); r(8, 5, 6, 4, hairC); r(16, 6, 1, 3, hairC); break;
    case "frosted": { const tip = "#F2EEDC"; r(8, 3, 8, 3, hairC); for (const [x, h] of [[8, 2], [10, 3], [12, 3], [14, 2]] as const) { r(x, 3 - h, 2, h, hairC); r(x, 3 - h, 2, 1, tip); } r(8, 3, 8, 1, tip); break; }
    case "spikes": r(8, 3, 8, 3, hairC); r(8, 1, 1, 2, hairC); r(10, 0, 1, 3, hairC); r(13, 0, 1, 3, hairC); r(15, 1, 1, 2, hairC); break;
    case "slick": r(7, 3, 10, 3, hairC); r(8, 3, 8, 1, shade(hairC, 0.3)); r(16, 6, 1, 2, hairC); break;
  }

  // Accessory
  const a1 = acc.c ?? "#111", a2 = acc.c2 ?? shade(a1, 0.3);
  switch (acc.style) {
    case "shades": r(9, 7, 3, 2, a1); r(12, 7, 3, 2, a1); r(12, 7, 1, 1, a1); break;
    case "roundspecs": r(8, 7, 4, 3, a1); r(13, 7, 4, 3, a1); r(9, 8, 2, 1, a2); r(14, 8, 2, 1, a2); r(12, 8, 1, 1, a1); break;
    case "starshades": r(9, 7, 3, 2, a1); r(12, 7, 3, 2, a1); r(10, 6, 1, 1, a1); r(13, 6, 1, 1, a1); break;
    case "beanie": r(7, 1, 10, 4, a1); r(7, 4, 10, 1, shade(a1, -0.3)); break;
    case "cap": r(7, 2, 10, 3, a1); r(4, 4, 4, 1, a1); r(11, 2, 2, 1, a2); break;
    case "cowboyhat": r(9, 0, 6, 4, a1); r(4, 4, 16, 1, a1); r(9, 3, 6, 1, shade(a1, -0.3)); break;
    case "chain": r(10, 14, 1, 2, a1); r(13, 14, 1, 2, a1); r(11, 16, 2, 1, a1); r(11, 17, 2, 2, a1); break;
    case "headphones": r(7, 2, 10, 1, a1); r(6, 3, 1, 4, a1); r(17, 3, 1, 4, a1); r(5, 7, 2, 3, a2); r(17, 7, 2, 3, a2); break;
    case "bandana": r(7, 3, 10, 2, a1); r(16, 5, 2, 2, a1); break;
    case "flower": r(15, 3, 2, 2, a1); r(15, 3, 1, 1, a2); break;
    case "crown": r(8, 1, 8, 2, a1); r(8, 0, 1, 1, a1); r(11, 0, 2, 1, a1); r(15, 0, 1, 1, a1); r(11, 1, 2, 1, "#C4372B"); break;
  }

  // A headset mic sits on the head, so it shows even when the arms are drawn separately (concerts)
  if (held.style === "headset") { r(16, 7, 1, 3, held.c ?? "#1E1E24"); r(13, 10, 3, 1, held.c2 ?? "#9AA0A6"); r(13, 10, 1, 1, held.c ?? "#1E1E24"); }

  // Held item, in the right hand (x ≈ tR..tR+2, y 25)
  if (withHeld) {
    const h1 = held.c ?? "#9AA0A6", h2 = held.c2 ?? shade(h1, -0.3);
    const hx = tR, hy = 25;
    switch (held.style) {
      case "mic": r(hx + 2, hy - 3, 1, 4, "#55555F"); r(hx + 1, hy - 5, 3, 2, h1); break;
      case "guitar": case "flyingv":
        r(tL - 1, 16, 2, 2, h2); for (let i = 0; i < 6; i++) r(tL + 1 + i, 18 + i, 1, 1, "#3A2410");
        if (held.style === "flyingv") { r(13, 22, 2, 3, h1); r(15, 21, 3, 2, h1); r(15, 25, 3, 2, h1); }
        else { r(12, 22, 6, 5, h1); r(13, 23, 2, 2, h2); }
        break;
      case "acoustic": r(tL - 1, 16, 2, 2, h2); for (let i = 0; i < 6; i++) r(tL + 1 + i, 18 + i, 1, 1, "#3A2410"); r(12, 22, 7, 6, h1); r(14, 24, 2, 2, h2); break;
      case "keytar": r(tL - 1, 21, tW + 4, 3, h1); for (let x = tL; x < tR + 2; x += 2) r(x, 22, 1, 2, h2); break;
      case "sticks": r(hx + 2, hy - 6, 1, 7, h1); r(tL - 2, hy - 6, 1, 7, h1); break;
    }
  }
  return out;
}

/** Is this item in the player's closet? `dropLooks` = look items from Gold drops, packs and merch orders. */
export function lookOwned(item: LookItem, c: { peakLevel: number; ownedLooks?: string[] }, dropLooks: Set<string>): boolean {
  if (dropLooks.has(item.id)) return true; // given in a pack or by an admin
  switch (item.source) {
    case "starter": return true;
    case "cash": return (c.ownedLooks ?? []).includes(item.id);
    case "level": return c.peakLevel >= (item.level ?? 1);
    default: return dropLooks.has(item.id);
  }
}

export const SLOTS: { id: Slot; name: string; emoji: string }[] = [
  { id: "hair", name: "Hair", emoji: "💇" },
  { id: "top", name: "Tops", emoji: "👕" },
  { id: "bottom", name: "Bottoms", emoji: "👖" },
  { id: "shoes", name: "Shoes", emoji: "👟" },
  { id: "acc", name: "Extras", emoji: "🕶️" },
  { id: "held", name: "Gear", emoji: "🎸" },
];
