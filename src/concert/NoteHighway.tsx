import { useEffect, useRef } from "react";
import { useSettings } from "../game/settings";
import type { ChartNote, Medley } from "../lib/chiptune";

export type Judge = "perfect" | "good" | "miss";
export interface HighwayResult { perfect: number; good: number; miss: number; total: number; maxCombo: number; accuracy: number }

/** Defaults (open mic, Normal). The concert passes venue/difficulty-tuned values. */
const DEFAULT_TUNING = { approach: 1.35, perfect: 0.075, good: 0.15 };
const LANE_COLORS = ["#ff42d8", "#1aa3ff", "#f2c230"];
const KEYS: Record<string, number> = {
  ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2, a: 0, s: 1, d: 2, j: 0, k: 1, l: 2, "1": 0, "2": 1, "3": 2,
};

interface Live extends ChartNote { state: "open" | "hit" | "miss"; judge?: Judge }
interface Pop { text: string; color: string; lane: number; born: number }

/**
 * Three lanes over the stage. Notes fall in time with the music; tap a lane (or press
 * ← ↓ → / A S D) as a note crosses the line. Empty taps aren't punished, so phones
 * with a little touch lag still feel fair.
 */
export default function NoteHighway({ medley, now, onJudge, onDone, tuning = DEFAULT_TUNING, lanes, onTap, hint = "TAP THE LANES ON THE LINE" }: {
  medley: Medley;
  /** approach = seconds a note takes to fall to the line; perfect/good = timing windows in seconds. */
  tuning?: { approach: number; perfect: number; good: number };
  now: () => number;
  onJudge: (j: Judge, combo: number) => void;
  onDone: (r: HighwayResult) => void;
  /** Optional lane names and colors (Drum School: kick, snare, hat). */
  lanes?: { labels: string[]; colors: string[] };
  /** Called on every tap, hit or not (Drum School plays the drum). */
  onTap?: (lane: number) => void;
  hint?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cb = useRef({ onJudge, onDone, onTap });
  cb.current = { onJudge, onDone, onTap };

  useEffect(() => {
    const { approach: APPROACH, perfect: PERFECT, good: GOOD } = tuning;
    const COLORS = lanes?.colors ?? LANE_COLORS;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const notes: Live[] = medley.notes.map((n) => ({ ...n, state: "open" }));
    const pops: Pop[] = [];
    const flash = [0, 0, 0];
    const tally = { perfect: 0, good: 0, miss: 0, combo: 0, maxCombo: 0 };
    let finished = false;
    let raf = 0;

    const judge = (n: Live, j: Judge) => {
      n.state = j === "miss" ? "miss" : "hit";
      n.judge = j;
      tally[j] += 1;
      tally.combo = j === "miss" ? 0 : tally.combo + 1;
      tally.maxCombo = Math.max(tally.maxCombo, tally.combo);
      pops.push({ text: j === "perfect" ? "PERFECT" : j === "good" ? "GOOD" : "MISS", color: j === "perfect" ? "#f2c230" : j === "good" ? "#1aa3ff" : "#ff4d6d", lane: n.lane, born: now() });
      cb.current.onJudge(j, tally.combo);
    };

    const tap = (lane: number) => {
      // Timing calibration: Bluetooth headphones and some screens make taps land late.
      const t = now() - (useSettings.getState().tapOffsetMs ?? 0) / 1000;
      flash[lane] = t;
      cb.current.onTap?.(lane);
      let best: Live | null = null;
      for (const n of notes) {
        if (n.state !== "open" || n.lane !== lane) continue;
        const d = Math.abs(n.t - t);
        if (d <= GOOD && (!best || d < Math.abs(best.t - t))) best = n;
        if (n.t - t > GOOD) break;
      }
      if (best) judge(best, Math.abs(best.t - t) <= PERFECT ? "perfect" : "good");
    };

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      tap(Math.max(0, Math.min(2, Math.floor(((e.clientX - r.left) / r.width) * 3))));
    };
    const onKey = (e: KeyboardEvent) => {
      const lane = KEYS[e.key];
      if (lane === undefined || e.repeat) return;
      e.preventDefault();
      tap(lane);
    };
    canvas.addEventListener("pointerdown", onPointer);
    // Test hook: lets automated playtests read the chart. Off unless the flag is set.
    try { if (localStorage.getItem("ts-debug")) Object.assign(window, { __chart: { notes, now, tap } }); } catch { /* ignore */ }
    window.addEventListener("keydown", onKey);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const t = now();
      const lineY = H * 0.8;
      const laneW = W / 3;

      for (const n of notes) if (n.state === "open" && t - n.t > GOOD) judge(n, "miss");

      // Lanes
      for (let i = 0; i < 3; i++) {
        const x = i * laneW;
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "rgba(5,4,15,0)");
        g.addColorStop(1, "rgba(5,4,15,0.72)");
        ctx.fillStyle = g;
        ctx.fillRect(x + 4, 0, laneW - 8, H);
        const lit = Math.max(0, 1 - (t - flash[i]) / 0.18);
        if (lit > 0) {
          ctx.fillStyle = COLORS[i] + Math.round(lit * 70).toString(16).padStart(2, "0");
          ctx.fillRect(x + 4, lineY - H * 0.35, laneW - 8, H * 0.35 + 6);
        }
        // Target pad
        ctx.strokeStyle = COLORS[i];
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.55 + lit * 0.45;
        ctx.beginPath();
        ctx.roundRect(x + laneW * 0.18, lineY - 13, laneW * 0.64, 26, 13);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (lanes?.labels[i]) {
          ctx.textAlign = "center";
          ctx.font = "8px 'Press Start 2P', monospace";
          ctx.fillStyle = COLORS[i];
          ctx.fillText(lanes.labels[i], x + laneW / 2, lineY + 30);
        }
      }

      // Notes
      for (const n of notes) {
        if (n.state === "hit") continue;
        const dt = n.t - t;
        if (dt > APPROACH || dt < -0.4) continue;
        const y = lineY - (dt / APPROACH) * lineY;
        const x = n.lane * laneW + laneW / 2;
        const s = 0.75 + (1 - dt / APPROACH) * 0.25;
        ctx.globalAlpha = n.state === "miss" ? 0.25 : 1;
        ctx.fillStyle = COLORS[n.lane];
        ctx.shadowColor = COLORS[n.lane];
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.roundRect(x - laneW * 0.3 * s, y - 10 * s, laneW * 0.6 * s, 20 * s, 10 * s);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillRect(x - laneW * 0.2 * s, y - 4 * s, laneW * 0.4 * s, 3 * s);
        ctx.globalAlpha = 1;
      }

      // Judgement pops
      ctx.textAlign = "center";
      ctx.font = "10px 'Press Start 2P', monospace";
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        const age = t - p.born;
        if (age > 0.6) { pops.splice(i, 1); continue; }
        ctx.globalAlpha = 1 - age / 0.6;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.lane * laneW + laneW / 2, lineY - 26 - age * 40);
      }
      ctx.globalAlpha = 1;

      // Combo
      if (tally.combo >= 5) {
        ctx.font = "14px 'Press Start 2P', monospace";
        ctx.fillStyle = "#f2c230";
        ctx.fillText(`${tally.combo} COMBO`, W / 2, H * 0.14);
      }

      // Count-in
      if (t < (notes[0]?.t ?? 2) - 0.1) {
        const left = Math.ceil(((notes[0]?.t ?? 2) - t) / (medley.stepSec * 2));
        ctx.font = "22px 'Press Start 2P', monospace";
        ctx.fillStyle = "#fff";
        ctx.fillText(left > 4 ? "READY" : String(Math.max(1, left)), W / 2, H * 0.42);
        ctx.font = "9px 'Press Start 2P', monospace";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(hint, W / 2, H * 0.42 + 28);
      }

      if (!finished && t > medley.durationSec + 0.3) {
        finished = true;
        const total = notes.length || 1;
        cb.current.onDone({
          perfect: tally.perfect, good: tally.good, miss: tally.miss, total, maxCombo: tally.maxCombo,
          accuracy: (tally.perfect + tally.good * 0.6) / total,
        });
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medley]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none select-none" aria-label="Rhythm lanes: tap left, middle or right as notes reach the line" />;
}
