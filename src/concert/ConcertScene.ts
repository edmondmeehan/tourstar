import Phaser from "phaser";
import { GRID_H, LOOK_ITEMS, SKIN_TONES, buildAvatar, lookItem, normalizeLook, type Look, type Px } from "../game/looks";

const hexNum = (h: string) => parseInt(h.slice(1), 16);
const SHORT = ["tee", "bandtee", "sparkle", "jersey"];

/** A bandmate's look: same vibe, different hair, skin and outfit. */
function bandmate(lead: Look, i: number, match = false): Look {
  // Matching outfits (boy-band style): same clothes as the lead, their own face and hair color.
  if (match) return { ...lead, skin: (lead.skin + 2 + i * 3) % SKIN_TONES.length, hairColor: (lead.hairColor + 1 + i * 2) % 12, held: lead.held === "held-headset" ? lead.held : "held-none" };
  const tops = LOOK_ITEMS.filter((x) => x.slot === "top" && x.source === "starter");
  const hairs = LOOK_ITEMS.filter((x) => x.slot === "hair" && x.source === "starter");
  return { ...lead, skin: (lead.skin + 2 + i * 3) % SKIN_TONES.length, hairColor: (lead.hairColor + 1 + i * 2) % 12, hair: hairs[(i * 3 + 1) % hairs.length].id, top: tops[(i * 2 + 3) % tops.length].id, acc: "acc-none", held: "held-none" };
}

/**
 * The live show. Progress runs 0→1 over the set; beams sweep, the LED wall and crowd
 * move on the beat, phone lights flicker, and pyro fires at the drop if the crew has it
 * (or the show sold out). Everything is drawn with Graphics — no image assets needed.
 */
export interface ConcertParams {
  attendance: number; // 0..1
  beatSec: number;
  pyro: boolean;
  lighting: boolean;
  sellout: boolean;
  onPyro?: () => void;
  /** Stage theme colors (Drops cosmetic). Defaults to the classic pink/blue. */
  theme?: { a: number; b: number; glow: number; sky: [number, number, number] };
  /** Dance moves (pack cosmetic) and how many performers are on stage. */
  moves?: { id: string; members: number; match?: boolean };
  /** The player's create-your-look outfit for the lead performer (band members get variations). */
  look?: Look;
}

/** One frame of a performer: offsets in px and arm angles in radians (0 = straight out to the side, -PI/2 = up). */
interface Pose { dx: number; lift: number; armR: number; armL: number; legs: number; squash: number }

/** Where each move puts the body at time t (seconds). progress 0..1 is how far through the show we are. */
function poseFor(id: string, t: number, beat: number, progress: number): Pose {
  const b = t / beat; // beats elapsed
  const ph = b % 1;
  const hit = Math.abs(Math.sin(Math.PI * b)); // 0 on the beat, 1 between
  const bob = hit * 8;
  const finale = progress > 0.97;
  switch (id) {
    case "step": {
      const side = Math.sin(Math.PI * b);
      return { dx: side * 10, lift: bob * 0.6, armR: 0.9 - side * 0.7, armL: Math.PI - 0.9 - side * 0.7, legs: side * 6, squash: 1 };
    }
    case "spin": {
      const inSpin = Math.floor(b) % 4 === 3;
      const sq = inSpin ? Math.abs(Math.cos(Math.PI * ph)) * 0.8 + 0.2 : 1;
      return { dx: 0, lift: bob, armR: inSpin ? -0.2 : 0.6, armL: inSpin ? Math.PI + 0.2 : Math.PI - 0.6, legs: 0, squash: sq };
    }
    case "point": {
      const on = ph < 0.35;
      return { dx: 0, lift: bob * 0.5, armR: on ? -0.15 : 0.8, armL: Math.PI - 1.1, legs: on ? 4 : 0, squash: 1 };
    }
    case "jump": {
      const up = Math.floor(b) % 2 === 0 ? Math.sin(Math.PI * ph) : 0;
      return { dx: 0, lift: up * 26, armR: up ? -1.2 : 0.7, armL: up ? Math.PI + 1.2 : Math.PI - 0.7, legs: up * 5, squash: 1 };
    }
    case "boyband": {
      if (finale) return { dx: 0, lift: 0, armR: -0.9, armL: Math.PI + 0.9, legs: 6, squash: 1 }; // the freeze
      const count = Math.floor(b) % 8;
      if (count < 4) { // step-touch with arm pops
        const side = count % 2 === 0 ? 1 : -1;
        return { dx: side * 8 * (1 - ph), lift: bob * 0.4, armR: ph < 0.5 ? -0.3 : 0.9, armL: ph < 0.5 ? Math.PI + 0.3 : Math.PI - 0.9, legs: side * 5, squash: 1 };
      }
      if (count < 6) return { dx: 0, lift: 2, armR: -1.35, armL: Math.PI - 1.0, legs: 3, squash: 1 }; // point up
      if (count === 6) return { dx: 0, lift: bob * 0.5, armR: 0.2, armL: Math.PI - 0.2, legs: 0, squash: Math.abs(Math.cos(Math.PI * ph)) * 0.8 + 0.2 }; // spin
      return { dx: 0, lift: 0, armR: 1.2, armL: Math.PI - 1.2, legs: 7, squash: 1 }; // hit the pose
    }
    default: {
      const arm = Math.sin(t * 3) * 0.6 + (progress > 0.6 ? -1.2 : -0.3);
      return { dx: 0, lift: bob, armR: arm, armL: -2.2, legs: 0, squash: 1 };
    }
  }
}

const PINK = 0xff42d8;
const BLUE = 0x1aa3ff;
const GOLD = 0xf2c230;

interface Fan { x: number; row: number; phase: number; size: number; phone: boolean; color: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: number }

function lerpColor(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

// Cheap smooth noise (stand-in for Perlin) — good enough for flicker.
function noise(x: number, y: number) {
  return (Math.sin(x * 1.7 + y * 3.1) * Math.sin(x * 0.9 - y * 1.3) + 1) / 2;
}

export class ConcertScene extends Phaser.Scene {
  progress = 0;
  /** Crowd energy 0..1, driven by how well the set is going. */
  energy = 0.6;
  private p!: ConcertParams;
  private g!: Phaser.GameObjects.Graphics;
  private t = 0;
  private fans: Fan[] = [];
  private sparks: Spark[] = [];
  private pyroFired = false;

  constructor() {
    super("concert");
  }

  init(data: ConcertParams) {
    this.p = data;
    this.fans = [];
    for (let row = 0; row < 5; row++) {
      const perRow = 18 + row * 4;
      for (let i = 0; i < perRow; i++) {
        if (Math.random() > 0.25 + data.attendance * 0.75) continue;
        this.fans.push({
          x: (i + Math.random() * 0.6) / perRow,
          row,
          phase: Math.random() * Math.PI * 2,
          size: 0.8 + Math.random() * 0.4,
          phone: Math.random() < 0.18,
          color: lerpColor(0x120a26, 0x2a1450, row / 5),
        });
      }
    }
  }

  create() {
    this.g = this.add.graphics();
  }

  private burst() {
    const { width: w, height: h } = this.scale;
    for (const fx of [0.18, 0.82]) {
      for (let i = 0; i < 40; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
        const sp = 180 + Math.random() * 260;
        this.sparks.push({ x: w * fx, y: h * 0.52, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8 + Math.random() * 0.6, color: Math.random() < 0.5 ? GOLD : 0xff8033 });
      }
    }
    this.p.onPyro?.();
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.t += dt;
    const p = this.p;
    if ((p.pyro || p.sellout) && !this.pyroFired && this.progress > 0.62) { this.pyroFired = true; this.burst(); }
    if (p.pyro && this.progress > 0.85 && Math.random() < 0.05) this.burst();
    for (const s of this.sparks) { s.vy += 260 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    this.draw();
  }

  private bodyCache = new Map<string, Px[]>();
  private bodyFor(look: Look) {
    const k = JSON.stringify(look);
    let px = this.bodyCache.get(k);
    if (!px) { px = buildAvatar(look, { arms: false }); this.bodyCache.set(k, px); }
    return px;
  }

  private drawFigure(g: Phaser.GameObjects.Graphics, x: number, floor: number, s: number, p: Pose, lead: boolean, look: Look) {
    const u = (64 / GRID_H) * s; // grid unit in px: the figure stands about 64px tall at scale 1
    const y = floor - p.lift * s;
    const sq = Math.max(0.2, p.squash);
    // Body, head, hair, clothes, shoes
    for (const r of this.bodyFor(look)) {
      g.fillStyle(hexNum(r.c), 1);
      g.fillRect(x + (r.x - 12) * u * sq, y - (GRID_H - r.y) * u, Math.max(1, r.w * u * sq), r.h * u);
    }
    // Arms follow the dance pose: sleeve in the top's color, hand in skin tone
    const top = lookItem(look.top);
    const skin = hexNum(SKIN_TONES[look.skin] ?? SKIN_TONES[0]);
    const sleeve = top?.style === "tank" ? skin : hexNum(top?.c ?? "#F2F2F2");
    const short = SHORT.includes(top?.style ?? "");
    const tW = look.body === "slim" ? 8 : look.body === "broad" ? 12 : 10;
    const sh = y - (GRID_H - 15) * u, len = 11 * u;
    const arm = (side: 1 | -1, ang: number) => {
      const sx = x + side * (tW / 2 + 1) * u * sq;
      const ex = sx + Math.cos(ang) * len * sq, ey = sh + Math.sin(ang) * len;
      const mx = sx + (ex - sx) * (short ? 0.4 : 1), my = sh + (ey - sh) * (short ? 0.4 : 1);
      g.lineStyle(2 * u, short ? skin : sleeve, 1); g.lineBetween(sx, sh, ex, ey);
      if (short) { g.lineStyle(2 * u, sleeve, 1); g.lineBetween(sx, sh, mx, my); }
      g.fillStyle(skin, 1); g.fillCircle(ex, ey, 1.2 * u);
      return { ex, ey };
    };
    arm(-1, p.armL);
    const hand = arm(1, p.armR);
    // What they're holding
    const held = lookItem(look.held);
    const showMic = lead || this.p.moves === undefined || (this.p.moves.members ?? 1) <= 1;
    if (held && held.style !== "none" && showMic) {
      const c1 = hexNum(held.c ?? "#9AA0A6"), c2 = hexNum(held.c2 ?? "#333333");
      if (held.style === "mic") { g.fillStyle(c1, 1); g.fillCircle(hand.ex, hand.ey - 1.2 * u, 1.4 * u); }
      else if (held.style === "sticks") { g.lineStyle(0.8 * u, c1, 1); g.lineBetween(hand.ex, hand.ey, hand.ex + 2 * u, hand.ey - 5 * u); }
      else if (["guitar", "acoustic", "flyingv", "keytar"].includes(held.style)) {
        const gy = y - (GRID_H - 24) * u;
        g.lineStyle(1 * u, 0x3a2410, 1); g.lineBetween(x - 7 * u * sq, gy - 6 * u, x + 3 * u * sq, gy);
        g.fillStyle(c1, 1); g.fillRect(x + 0.5 * u * sq, gy - 2 * u, (held.style === "keytar" ? 10 : 6) * u * sq, 5 * u);
        g.fillStyle(c2, 1); g.fillRect(x + 2 * u * sq, gy - 0.5 * u, 2 * u * sq, 2 * u);
      }
    }
  }

  private draw() {
    const g = this.g;
    const { width: W, height: H } = this.scale;
    const p = this.p;
    const t = this.t;
    const beat = Math.max(0.2, p.beatSec);
    const beatPos = (t / beat) % 1;
    const pulse = 1 - beatPos;
    const ramp = Phaser.Math.SmoothStep(Math.min(1, this.progress * 1.6), 0, 1);
    const intensity = (ramp * 0.8 + 0.2) * (0.45 + 0.55 * this.energy);
    const th = p.theme ?? { a: PINK, b: BLUE, glow: GOLD, sky: [0x05040f, 0x140a2e, 0x2a0f45] as [number, number, number] };
    const accent = p.sellout ? th.a : th.b;
    g.clear();

    // Back wall: banded gradient
    const stops = th.sky;
    const bands = 18;
    for (let i = 0; i < bands; i++) {
      const k = i / (bands - 1);
      const seg = k * (stops.length - 1);
      const j = Math.min(stops.length - 2, Math.floor(seg));
      g.fillStyle(lerpColor(stops[j], stops[j + 1], seg - j), 1);
      g.fillRect(0, (H * 0.62 * i) / bands, W, (H * 0.62) / bands + 1);
    }

    // LED wall
    const wallY = H * 0.12, wallH = H * 0.26;
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 5; j++) {
        const on = noise(i * 0.4 + t * 0.8, j * 0.4) * intensity * (0.5 + pulse * 0.5);
        g.fillStyle(lerpColor(0x0b0820, accent, on * 0.85), 1);
        g.fillRect(W * (0.1 + i * 0.067), wallY + (j * wallH) / 5, W * 0.06, wallH / 5 - 3);
      }
    }

    // Truss
    g.fillStyle(0x3a3f58, 1);
    g.fillRect(W * 0.05, H * 0.06, W * 0.9, 6);

    // Beams
    const beams = p.lighting ? 8 : 4;
    for (let i = 0; i < beams; i++) {
      const bx = W * (0.12 + (0.76 * i) / (beams - 1));
      const sweep = Math.sin(t * (0.8 + i * 0.13) + i) * W * 0.35;
      const col = i % 2 === 0 ? th.a : th.b;
      const a = 0.1 + 0.12 * intensity * (p.lighting ? 1.3 : 1) + pulse * 0.05;
      g.fillStyle(col, a);
      g.fillTriangle(bx, H * 0.07, bx + sweep - 40, H, bx + sweep + 40, H);
      g.fillStyle(col, 1);
      g.fillCircle(bx, H * 0.075, 5);
    }

    // Stage
    const stageY = H * 0.52;
    g.fillStyle(0x1d1838, 1);
    g.fillRect(0, stageY, W, H * 0.05);
    g.fillStyle(accent, 1);
    g.fillRect(0, stageY, W, 3);

    // Spotlight halo
    const fx = W * 0.5;
    g.fillStyle(th.glow, 0.12 + pulse * 0.08);
    g.fillTriangle(fx, H * 0.07, fx - 46, stageY, fx + 46, stageY);

    // Performer(s)
    const mv = p.moves ?? { id: "classic", members: 1 };
    const members = Math.max(1, Math.min(5, Math.round(mv.members || 1)));
    const leadLook = p.look ?? normalizeLook(undefined, "pop");
    const scale = members >= 4 ? 0.8 : members >= 2 ? 0.9 : 1;
    const gap = Math.min(W * 0.16, 44) * scale;
    for (let m = 0; m < members; m++) {
      const x = fx + (m - (members - 1) / 2) * gap;
      // A tiny delay across the line reads as a ripple at the end; otherwise everyone is in sync.
      const pose = poseFor(mv.id, this.t, beat, this.progress);
      const isLead = members === 1 || m === Math.floor(members / 2);
      this.drawFigure(g, x + pose.dx * scale, stageY, scale, pose, members > 1 && isLead, isLead ? leadLook : bandmate(leadLook, m, !!mv.match));
    }

    // Floor + crowd
    const floorTop = H * 0.6;
    g.fillStyle(0x07050f, 1);
    g.fillRect(0, stageY + H * 0.05, W, H);
    for (let row = 0; row < 5; row++) {
      for (const f of this.fans) {
        if (f.row !== row) continue;
        const y = floorTop + (row * (H - floorTop)) / 5.2;
        const s = (10 + row * 4) * f.size;
        const jump = Math.max(0, Math.sin((t * Math.PI * 2) / beat + f.phase)) * s * 0.35 * intensity;
        const x = f.x * W;
        g.fillStyle(f.color, 1);
        g.fillCircle(x, y - jump, s * 0.45);
        g.fillRect(x - s * 0.55, y - jump + s * 0.35, s * 1.1, s * 1.6);
        if (intensity > 0.5 && (f.phase > 3 || this.progress > 0.6)) {
          g.lineStyle(s * 0.2, f.color, 1);
          g.lineBetween(x - s * 0.4, y - jump + s * 0.4, x - s * 0.7, y - jump - s * 0.6);
          g.lineBetween(x + s * 0.4, y - jump + s * 0.4, x + s * 0.7, y - jump - s * 0.6);
        }
        if (f.phone && this.progress > 0.3) {
          g.fillStyle(0xffffd9, 0.4 + noise(f.phase * 10, t * 2) * 0.6);
          g.fillRect(x + s * 0.6, y - jump - s * 0.8, 3, 5);
        }
      }
    }

    for (const s of this.sparks) {
      g.fillStyle(s.color, Math.min(1, s.life));
      g.fillRect(s.x, s.y, 3, 3);
    }

    if (intensity > 0.6 && beatPos < 0.08) {
      g.fillStyle(0xffffff, 0.05);
      g.fillRect(0, 0, W, H);
    }
  }
}

export function startConcert(parent: HTMLElement, params: ConcertParams) {
  const scene = new ConcertScene();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#05040f",
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 390, height: parent.clientHeight || 600 },
    scene: [],
  });
  game.scene.add("concert", scene, true, params);
  return {
    setProgress: (k: number) => { scene.progress = k; },
    setEnergy: (e: number) => { scene.energy = Math.max(0, Math.min(1, e)); },
    destroy: () => game.destroy(true),
  };
}
