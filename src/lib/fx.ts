import { useSettings } from "../game/settings";
import { haptic, type HapticName, type Step } from "./haptics";

let ctx: AudioContext | null = null;
export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function masterVolume() {
  const { volume, muted } = useSettings.getState();
  return muted ? 0 : volume;
}

type Blip = "start" | "click" | "coin" | "levelup" | "bad" | "event";

const BLIPS: Record<Blip, { notes: number[]; wave: OscillatorType; step: number }> = {
  start: { notes: [523, 659, 784, 1047], wave: "square", step: 0.07 },
  click: { notes: [880], wave: "square", step: 0.04 },
  coin: { notes: [988, 1319], wave: "square", step: 0.07 },
  levelup: { notes: [523, 659, 784, 1047, 784, 1047, 1319], wave: "square", step: 0.09 },
  bad: { notes: [330, 262, 196], wave: "sawtooth", step: 0.12 },
  event: { notes: [659, 880], wave: "triangle", step: 0.1 },
};

/** Play a sound and its matching haptic. Pass a different haptic name to override, or null for none. */
export function sfx(kind: Blip, feel: HapticName | null = kind) {
  if (feel) haptic(feel); // haptics play even when the sound is muted
  const vol = masterVolume();
  if (vol <= 0) return;
  try {
    const a = audio();
    const b = BLIPS[kind];
    const t0 = a.currentTime;
    b.notes.forEach((f, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = b.wave;
      o.frequency.value = f;
      const t = t0 + i * b.step;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + b.step * 0.95);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + b.step);
    });
  } catch {
    /* audio unavailable */
  }
}

/** Legacy: a raw on/off millisecond pattern, mapped onto haptic taps. Prefer haptic("name"). */
export function vibrate(pattern: number | number[] = 30) {
  const arr = Array.isArray(pattern) ? pattern : [pattern];
  const steps: Step[] = [];
  let t = 0;
  for (let i = 0; i < arr.length; i += 2) {
    const ms = arr[i];
    steps.push({ at: t, tap: ms >= 50 ? "heavy" : ms >= 25 ? "medium" : "light" });
    t += ms + (arr[i + 1] ?? 0);
  }
  haptic(steps);
}

/** Crowd roar: filtered noise swell (~2s). */
export function cheer() {
  haptic("cheer");
  const vol = masterVolume();
  if (vol <= 0) return;
  try {
    const a = audio();
    const len = 2.2;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    const g = a.createGain();
    const t = a.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(lp).connect(g).connect(a.destination);
    src.start(t);
  } catch {
    /* audio unavailable */
  }
}
