import { GENRES } from "../game/data";
import type { GenreId } from "../game/types";

/**
 * Procedural chiptune songs (pure engine; the game wraps it in lib/chiptune.ts with its settings,
 * and the splash page uses it directly). Each song is fully described by (seed, genre),
 * so the Locker only stores two numbers per track. When a real AI music
 * service (ElevenLabs / Replicate) is connected in phase 2, Song gets an
 * audioUrl and the player plays that instead.
 */

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export interface Pattern {
  tempo: number;
  wave: OscillatorType;
  lead: (number | null)[];
  bass: number[];
  stepSec: number;
  durationSec: number;
}

export function makePattern(seed: number, genre: GenreId): Pattern {
  const g = GENRES[genre];
  const r = mulberry(seed);
  const root = 57 + Math.floor(r() * 7); // A3..D#4
  const scale = g.scale;
  const prog = [0, 5, 3, 4].map((x) => (x + Math.floor(r() * 2)) % 7);
  const motif: (number | null)[] = Array.from({ length: 8 }, () => (r() < 0.2 ? null : scale[Math.floor(r() * scale.length)] + (r() < 0.25 ? 12 : 0)));
  const lead: (number | null)[] = [];
  const bass: number[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const chord = scale[prog[bar % 4] % scale.length];
    const vary = bar % 4 === 3;
    for (let i = 0; i < 8; i++) {
      const m = vary && r() < 0.5 ? scale[Math.floor(r() * scale.length)] : motif[i];
      lead.push(m === null ? null : root + 12 + m + (bar >= 4 ? chord % 5 : 0));
      bass.push(root - 12 + chord);
    }
  }
  const stepSec = 60 / g.tempo / 2;
  return { tempo: g.tempo, wave: g.wave, lead, bass, stepSec, durationSec: stepSec * lead.length };
}

export interface PlayHandle {
  stop: () => void;
  durationSec: number;
}

type Voice = { note: (freq: number, t: number, len: number, wave: OscillatorType, level: number) => void; noise: (t: number, len: number, level: number) => void };

function makeVoice(a: AudioContext, out: GainNode, nodes: OscillatorNode[]): Voice {
  return {
    note: (freq, t, len, wave, level) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = wave;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + len + 0.02);
      nodes.push(o);
    },
    noise: (t, len, level) => {
      const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = a.createBufferSource();
      const g = a.createGain();
      g.gain.value = level;
      src.buffer = buf;
      src.connect(g).connect(out);
      src.start(t);
    },
  };
}

function scheduleSteps(v: Voice, p: Pattern, from: number, count: number, tStart: number) {
  for (let k = 0; k < count; k++) {
    const i = (from + k) % p.lead.length;
    const t = tStart + k * p.stepSec;
    const n = p.lead[i];
    if (n !== null) v.note(midi(n), t, p.stepSec * 0.9, p.wave, 0.5);
    if (i % 2 === 0) v.note(midi(p.bass[i]), t, p.stepSec * 1.8, "triangle", 0.7);
    if (i % 4 === 2) v.noise(t, 0.06, 0.25);
    if (i % 8 === 0) v.note(55, t, 0.12, "sine", 0.9);
  }
}

function player(durationSec: number, out: GainNode, nodes: OscillatorNode[], a: AudioContext, onEnd?: () => void) {
  let done = false;
  const timer = window.setTimeout(() => {
    if (!done) {
      done = true;
      out.disconnect();
      onEnd?.();
    }
  }, (durationSec + 0.15) * 1000);
  return () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    out.gain.setValueAtTime(0, a.currentTime);
    nodes.forEach((n) => {
      try { n.stop(); } catch { /* already stopped */ }
    });
    out.disconnect();
  };
}

export function playSongWith(a: AudioContext, vol: number, seed: number, genre: GenreId, onEnd?: () => void): PlayHandle {
  const p = makePattern(seed, genre);
  const out = a.createGain();
  out.gain.value = 0.18 * vol;
  out.connect(a.destination);
  const nodes: OscillatorNode[] = [];
  scheduleSteps(makeVoice(a, out, nodes), p, 0, p.lead.length, a.currentTime + 0.05);
  return { durationSec: p.durationSec, stop: player(p.durationSec, out, nodes, a, onEnd) };
}

/* ---------- Live show medley + rhythm chart ---------- */

export interface ChartNote { t: number; lane: 0 | 1 | 2; song: number }
export interface Medley {
  stepSec: number;
  stepsPerSong: number;
  durationSec: number;
  /** Start of each song, in seconds from the top of the set. */
  songStarts: number[];
  notes: ChartNote[];
}

/** Steps per song so a set lasts roughly 16-25s whatever its length. */
export function stepsPerSong(songs: number) {
  return Math.max(16, Math.min(32, Math.round(64 / Math.max(1, songs) / 8) * 8));
}

/**
 * The tap chart follows each song's melody. difficulty 0..1: easy charts use only
 * on-beat notes; harder ones add off-beats. Lanes come from pitch, so the same melody
 * always maps the same way.
 */
export function makeMedley(seeds: number[], genre: GenreId, difficulty: number, intro = 2): Medley {
  const per = stepsPerSong(seeds.length);
  const notes: ChartNote[] = [];
  let stepSec = 0.25;
  seeds.forEach((seed, si) => {
    const p = makePattern(seed, genre);
    stepSec = p.stepSec;
    // Each song plays from a different spot so repeats in a medley still differ.
    const from = (seed % 4) * 8;
    let lastLane = -1;
    for (let k = 0; k < per; k++) {
      const i = (from + k) % p.lead.length;
      const n = p.lead[i];
      if (n === null) continue;
      const offBeat = i % 2 === 1;
      if (offBeat && ((i * 2654435761) >>> 0) % 100 >= difficulty * 70) continue;
      let lane = (n % 3) as 0 | 1 | 2;
      if (lane === lastLane && offBeat) lane = ((lane + 1) % 3) as 0 | 1 | 2;
      lastLane = lane;
      notes.push({ t: intro + (si * per + k) * stepSec, lane, song: si });
    }
  });
  const songStarts = seeds.map((_, si) => intro + si * per * stepSec);
  return { stepSec, stepsPerSong: per, durationSec: intro + seeds.length * per * stepSec, songStarts, notes };
}

export interface MedleyHandle {
  stop: () => void;
  /** Seconds since the top of the set, on the audio clock (falls back to wall clock). */
  now: () => number;
}

export function playMedleyWith(a: AudioContext | null, vol: number, seeds: number[], genre: GenreId, m: Medley, intro = 2): MedleyHandle {
  if (!a) {
    const t0 = performance.now() / 1000 + 0.1;
    return { stop: () => {}, now: () => performance.now() / 1000 - t0 };
  }
  const ctx = a;
  const out = ctx.createGain();
  out.gain.value = 0.18 * vol;
  out.connect(ctx.destination);
  const nodes: OscillatorNode[] = [];
  const v = makeVoice(ctx, out, nodes);
  const t0 = ctx.currentTime + 0.1;
  // Count-in: four sticks on the beat.
  for (let i = 0; i < 4; i++) v.noise(t0 + intro - (4 - i) * m.stepSec * 2, 0.03, 0.35);
  seeds.forEach((seed, si) => {
    const p = makePattern(seed, genre);
    scheduleSteps(v, p, (seed % 4) * 8, m.stepsPerSong, t0 + intro + si * m.stepsPerSong * m.stepSec);
  });
  const stop = player(m.durationSec + 0.2, out, nodes, ctx);
  // Follow the audio clock so taps line up with the music. If audio never starts
  // (blocked or unavailable), settle on the wall clock instead.
  const wall0 = performance.now() / 1000 + 0.1;
  let mode: "audio" | "wall" | null = null;
  // ctx.currentTime moves in audio-buffer steps (often 10-40ms); smooth between steps
  // with the wall clock so judging stays precise.
  let lastCtx = -1, lastPerf = 0;
  return {
    stop,
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

const ADJ = ["Neon", "Basement", "Velvet", "Midnight", "Electric", "Paper", "Golden", "Broken", "Static", "Cherry", "Wild", "Lonely", "Chrome", "Sugar"];
const NOUN = ["Dreams", "Highway", "Heart", "Skyline", "Riot", "Summer", "Ghost", "Fever", "Signal", "Echo", "Crown", "Satellite", "Sirens", "Tapes"];

export function songTitle(seed: number) {
  const r = mulberry(seed * 7 + 3);
  return `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[Math.floor(r() * NOUN.length)]}`;
}
