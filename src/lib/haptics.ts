// Haptics for every sound. Each sound has a matching pattern timed to its notes, played with
// the iPhone Taptic Engine / Android vibration motor (Capacitor Haptics), or navigator.vibrate on
// Android web. Respects the Vibration setting (off / low / med / high) and works even when sound is muted.
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "./native";
import { useSettings } from "../game/settings";

type Tap = "select" | "light" | "medium" | "heavy" | "success" | "warning" | "error";
export interface Step { at: number; tap: Tap } // at = ms from start

/** Sound name → haptic pattern (timings mirror the notes in fx.ts). */
export const PATTERNS = {
  // UI
  click: [{ at: 0, tap: "select" }],
  start: [{ at: 0, tap: "light" }, { at: 70, tap: "light" }, { at: 140, tap: "medium" }, { at: 210, tap: "heavy" }],
  coin: [{ at: 0, tap: "light" }, { at: 70, tap: "medium" }],
  levelup: [
    { at: 0, tap: "light" }, { at: 90, tap: "light" }, { at: 180, tap: "medium" }, { at: 270, tap: "medium" },
    { at: 360, tap: "light" }, { at: 450, tap: "medium" }, { at: 560, tap: "success" },
  ],
  bad: [{ at: 0, tap: "error" }],
  event: [{ at: 0, tap: "medium" }, { at: 100, tap: "light" }],
  // Concert
  perfect: [{ at: 0, tap: "medium" }],
  good: [{ at: 0, tap: "light" }],
  miss: [{ at: 0, tap: "warning" }],
  combo: [{ at: 0, tap: "medium" }, { at: 60, tap: "heavy" }],
  kick: [{ at: 0, tap: "light" }],
  pyro: [{ at: 0, tap: "heavy" }, { at: 90, tap: "heavy" }, { at: 220, tap: "medium" }],
  /** Crowd roar: a ~1.4s rumble that swells and fades, like the cheer sound. */
  cheer: [0, 90, 170, 240, 300, 360, 420, 480, 550, 640, 760, 900, 1080, 1300].map((at, i, a) => ({
    at, tap: (i < 3 || i > a.length - 4 ? "light" : i < 6 || i > a.length - 7 ? "medium" : "heavy") as Tap,
  })),
  // Rewards
  success: [{ at: 0, tap: "success" }],
  collect: [{ at: 0, tap: "light" }, { at: 60, tap: "light" }, { at: 120, tap: "medium" }, { at: 220, tap: "success" }],
  drag: [{ at: 0, tap: "select" }],
  pickup: [{ at: 0, tap: "medium" }],
} satisfies Record<string, Step[]>;
export type HapticName = keyof typeof PATTERNS;

const LEVEL = { off: 0, low: 1, med: 2, high: 3 } as const;
const IMPACT: Record<"light" | "medium" | "heavy", number> = { light: 1, medium: 2, heavy: 3 };
const STYLE = [ImpactStyle.Light, ImpactStyle.Light, ImpactStyle.Medium, ImpactStyle.Heavy];
const WEB_MS: Record<Tap, number> = { select: 6, light: 12, medium: 22, heavy: 38, success: 30, warning: 30, error: 45 };

function fire(tap: Tap, level: number) {
  if (tap === "select") return void Haptics.selectionChanged().catch(() => {});
  if (tap === "success" || tap === "warning" || tap === "error") {
    if (level === 1) return void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    const type = tap === "success" ? NotificationType.Success : tap === "warning" ? NotificationType.Warning : NotificationType.Error;
    return void Haptics.notification({ type }).catch(() => {});
  }
  // low setting softens one step, high strengthens one step
  const strength = Math.max(1, Math.min(3, IMPACT[tap] + (level - 2)));
  void Haptics.impact({ style: STYLE[strength] }).catch(() => {});
}

let lastAt = 0;
/** Play a named pattern (or custom steps). Rapid-fire UI ticks are throttled so they never blur together. */
export function haptic(p: HapticName | Step[]) {
  const level = LEVEL[useSettings.getState().vibration];
  if (!level) return;
  const steps = typeof p === "string" ? PATTERNS[p] : p;
  const now = performance.now();
  if (p === "click" || p === "drag" || p === "kick") { if (now - lastAt < 35) return; }
  lastAt = now;

  if (isNative) {
    for (const s of steps) {
      if (s.at === 0) fire(s.tap, level);
      else window.setTimeout(() => fire(s.tap, level), s.at);
    }
    return;
  }
  // Web: Android Chrome supports vibrate(); iPhone Safari ignores it.
  if (!("vibrate" in navigator)) return;
  const scale = [0, 0.6, 1, 1.6][level];
  const seq: number[] = [];
  let t = 0;
  for (const s of steps) {
    const gap = Math.max(0, s.at - t);
    if (seq.length) seq.push(gap); else if (gap) seq.push(0, gap);
    const on = Math.round(WEB_MS[s.tap] * scale);
    seq.push(on);
    t = s.at + on;
  }
  try { navigator.vibrate(seq); } catch { /* ignore */ }
}
