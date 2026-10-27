import Phaser from "phaser";

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

  private draw() {
    const g = this.g;
    const { width: W, height: H } = this.scale;
    const p = this.p;
    const t = this.t;
    const beat = Math.max(0.2, p.beatSec);
    const beatPos = (t / beat) % 1;
    const pulse = 1 - beatPos;
    const intensity = Phaser.Math.SmoothStep(Math.min(1, this.progress * 1.6), 0, 1) * 0.8 + 0.2;
    const accent = p.sellout ? PINK : BLUE;
    g.clear();

    // Back wall: banded gradient
    const stops = [0x05040f, 0x140a2e, 0x2a0f45];
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
      const col = i % 2 === 0 ? PINK : BLUE;
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
    g.fillStyle(GOLD, 0.12 + pulse * 0.08);
    g.fillTriangle(fx, H * 0.07, fx - 46, stageY, fx + 46, stageY);

    // Performer
    const bob = Math.abs(Math.sin((t * Math.PI) / beat)) * 8;
    const body = 0x05030c;
    g.fillStyle(body, 1);
    g.fillRect(fx - 9, stageY - 44 - bob, 18, 30);
    g.fillRect(fx - 9, stageY - 16 - bob * 0.5, 7, 16 + bob * 0.5);
    g.fillRect(fx + 2, stageY - 16 - bob * 0.5, 7, 16 + bob * 0.5);
    g.fillCircle(fx, stageY - 54 - bob, 10);
    const arm = Math.sin(t * 3) * 0.6 + (this.progress > 0.6 ? -1.2 : -0.3);
    g.lineStyle(6, body, 1);
    g.lineBetween(fx + 8, stageY - 40 - bob, fx + 8 + Math.cos(arm) * 22, stageY - 40 - bob + Math.sin(arm) * 22);
    g.lineBetween(fx - 8, stageY - 40 - bob, fx - 14, stageY - 52 - bob);
    g.fillStyle(0x888888, 1);
    g.fillCircle(fx - 14, stageY - 56 - bob, 3);

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
    destroy: () => game.destroy(true),
  };
}
