// A tiny synthesized drum kit for Drum School: kick, snare and hi-hat, plus a backing bassline and
// a quiet guide track of the groove. Your taps play the drums out loud.
import type { Lesson } from "../game/drums";
import { lessonTiming } from "../game/drums";
import { audio, masterVolume } from "./fx";

export interface DrumHandle {
  /** Seconds since the top of the lesson, on the audio clock (falls back to wall clock). */
  now: () => number;
  hit: (lane: number) => void;
  stop: () => void;
}

let noiseBuf: AudioBuffer | null = null;
function noise(a: AudioContext) {
  if (!noiseBuf || noiseBuf.sampleRate !== a.sampleRate) {
    noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.4), a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function drum(a: AudioContext, out: AudioNode, lane: number, t: number, level: number) {
  if (lane === 0) { // kick: a falling sine thump
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.35);
    return;
  }
  const src = a.createBufferSource();
  src.buffer = noise(a);
  const f = a.createBiquadFilter();
  const g = a.createGain();
  if (lane === 1) { // snare: noise crack + body tone
    f.type = "highpass"; f.frequency.value = 1200;
    g.gain.setValueAtTime(level * 0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const o = a.createOscillator(), og = a.createGain();
    o.type = "triangle"; o.frequency.value = 190;
    og.gain.setValueAtTime(level * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og).connect(out);
    o.start(t); o.stop(t + 0.1);
  } else { // hat: short bright tick
    f.type = "highpass"; f.frequency.value = 7000;
    g.gain.setValueAtTime(level * 0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  }
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.2, 0.25);
}

const BASS = [41, 41, 44, 39]; // MIDI roots, one per bar (F, F, Ab, Eb)
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function playLesson(l: Lesson): DrumHandle {
  let a: AudioContext | null = null;
  try { a = audio(); } catch { a = null; }
  const vol = masterVolume();
  if (!a || vol <= 0) {
    const t0 = performance.now() / 1000 + 0.1;
    return { now: () => performance.now() / 1000 - t0, hit: () => {}, stop: () => {} };
  }
  const ctx = a;
  const out = ctx.createGain();
  out.gain.value = 0.5 * vol;
  out.connect(ctx.destination);
  const { beat, step, intro } = lessonTiming(l);
  const t0 = ctx.currentTime + 0.1;
  // Count-in: four sticks.
  for (let i = 0; i < 4; i++) drum(ctx, out, 2, t0 + i * beat, 0.9);
  // Guide track (quiet) and bassline.
  const guide = ctx.createGain();
  guide.gain.value = 0.28;
  guide.connect(out);
  const oscs: OscillatorNode[] = [];
  for (let bar = 0; bar < l.bars; bar++) {
    const root = BASS[bar % BASS.length];
    for (let i = 0; i < 16; i++) {
      const t = t0 + intro + (bar * 16 + i) * step;
      if (l.kick[i] === "x") drum(ctx, guide, 0, t, 0.8);
      if (l.snare[i] === "x") drum(ctx, guide, 1, t, 0.8);
      if (l.hat[i] === "x") drum(ctx, guide, 2, t, 0.8);
      if (i % 4 === 0 || l.kick[i] === "x") {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = hz(root + (i === 10 ? 7 : 0));
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.8);
        o.connect(g).connect(out);
        o.start(t); o.stop(t + step * 2);
        oscs.push(o);
      }
    }
  }
  let stopped = false;
  const wall0 = performance.now() / 1000 + 0.1;
  let mode: "audio" | "wall" | null = null;
  let lastCtx = -1, lastPerf = 0;
  return {
    hit: (lane) => { if (!stopped) drum(ctx, out, lane, ctx.currentTime, 1); },
    stop: () => {
      if (stopped) return;
      stopped = true;
      out.gain.setValueAtTime(0, ctx.currentTime);
      oscs.forEach((o) => { try { o.stop(); } catch { /* done */ } });
      window.setTimeout(() => out.disconnect(), 400);
    },
    now: () => {
      const perf = performance.now() / 1000;
      const wall = perf - wall0;
      if (!mode && wall > 0.4) mode = ctx.state === "running" ? "audio" : "wall";
      if (mode === "wall" || (!mode && ctx.state !== "running")) return wall;
      const c = ctx.currentTime;
      if (c !== lastCtx) { lastCtx = c; lastPerf = perf; }
      return c - t0 + Math.min(perf - lastPerf, 0.1);
    },
  };
}
