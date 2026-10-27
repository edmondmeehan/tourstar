import { GENRES } from "../game/data";
import type { GenreId } from "../game/types";
import { audio, masterVolume } from "./fx";

/**
 * Procedural chiptune songs. Each song is fully described by (seed, genre),
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

export function playSong(seed: number, genre: GenreId, onEnd?: () => void): PlayHandle {
  const a = audio();
  const p = makePattern(seed, genre);
  const vol = masterVolume();
  const out = a.createGain();
  out.gain.value = 0.18 * vol;
  out.connect(a.destination);
  const t0 = a.currentTime + 0.05;
  const nodes: OscillatorNode[] = [];

  const note = (freq: number, t: number, len: number, wave: OscillatorType, level: number) => {
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
  };

  const noise = (t: number, len: number, level: number) => {
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource();
    const g = a.createGain();
    g.gain.value = level;
    s.buffer = buf;
    s.connect(g).connect(out);
    s.start(t);
  };

  p.lead.forEach((n, i) => {
    const t = t0 + i * p.stepSec;
    if (n !== null) note(midi(n), t, p.stepSec * 0.9, p.wave, 0.5);
    if (i % 2 === 0) note(midi(p.bass[i]), t, p.stepSec * 1.8, "triangle", 0.7);
    if (i % 4 === 2) noise(t, 0.06, 0.25);
    if (i % 8 === 0) note(55, t, 0.12, "sine", 0.9);
  });

  let done = false;
  const timer = window.setTimeout(() => {
    if (!done) {
      done = true;
      out.disconnect();
      onEnd?.();
    }
  }, (p.durationSec + 0.15) * 1000);

  return {
    durationSec: p.durationSec,
    stop: () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      out.gain.setValueAtTime(0, a.currentTime);
      nodes.forEach((n) => {
        try { n.stop(); } catch { /* already stopped */ }
      });
      out.disconnect();
    },
  };
}

const ADJ = ["Neon", "Basement", "Velvet", "Midnight", "Electric", "Paper", "Golden", "Broken", "Static", "Cherry", "Wild", "Lonely", "Chrome", "Sugar"];
const NOUN = ["Dreams", "Highway", "Heart", "Skyline", "Riot", "Summer", "Ghost", "Fever", "Signal", "Echo", "Crown", "Satellite", "Sirens", "Tapes"];

export function songTitle(seed: number) {
  const r = mulberry(seed * 7 + 3);
  return `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[Math.floor(r() * NOUN.length)]}`;
}
