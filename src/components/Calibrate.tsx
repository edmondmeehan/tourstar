// Rhythm timing check: tap along to 12 clicks. We measure how late (or early) your taps land and
// shift the judging window, so Bluetooth headphones and slower phones aren't punished.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { audio, unlockAudio } from "../lib/fx";
import { audioClock } from "../lib/synth";
import { useSettings } from "../game/settings";
import { track } from "../lib/analytics";

const BEAT = 0.6, BEATS = 12, WARMUP = 2;

export default function Calibrate({ onClose }: { onClose: () => void }) {
  const set = useSettings((s) => s.set);
  const current = useSettings((s) => s.tapOffsetMs ?? 0);
  const [state, setState] = useState<"idle" | "run" | "done">("idle");
  const [result, setResult] = useState<number | null>(null);
  const [pulse, setPulse] = useState(-1);
  const taps = useRef<number[]>([]);
  const clock = useRef<(() => number) | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const start = () => {
    unlockAudio();
    taps.current = [];
    setResult(null);
    let a: AudioContext | null = null;
    try { a = audio(); } catch { a = null; }
    const t0 = (a?.currentTime ?? 0) + 0.6;
    if (a) {
      const out = a.createGain();
      out.gain.value = 0.35;
      out.connect(a.destination);
      for (let i = 0; i < BEATS; i++) {
        const o = a.createOscillator(), g = a.createGain();
        const at = t0 + i * BEAT;
        o.frequency.value = i < WARMUP ? 880 : 1320;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(1, at + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
        o.connect(g).connect(out);
        o.start(at); o.stop(at + 0.1);
      }
      clock.current = audioClock(a, t0);
    } else {
      const w0 = performance.now() / 1000 + 0.6;
      clock.current = () => performance.now() / 1000 - w0;
    }
    setState("run");
    const loop = () => {
      const t = clock.current!();
      setPulse(t >= -0.05 ? Math.round(t / BEAT) : -1);
      if (t < BEATS * BEAT + 0.4) raf.current = requestAnimationFrame(loop);
      else finish();
    };
    raf.current = requestAnimationFrame(loop);
  };

  const finish = () => {
    const ds = taps.current
      .map((t) => { const k = Math.round(t / BEAT); return k >= WARMUP && k < BEATS ? t - k * BEAT : null; })
      .filter((d): d is number => d !== null && Math.abs(d) < 0.28)
      .sort((x, y) => x - y);
    setState("done");
    if (ds.length < 5) { setResult(null); return; }
    const med = ds[Math.floor(ds.length / 2)];
    setResult(Math.max(-150, Math.min(300, Math.round(med * 1000))));
  };

  const tap = () => { if (state === "run" && clock.current) taps.current.push(clock.current()); };

  const save = () => {
    if (result === null) return;
    set({ tapOffsetMs: result });
    track("calibrated", { ms: result });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => state !== "run" && onClose()}>
      <div className="panel w-full max-w-sm p-5 animate-pop text-center" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-pixel text-xs" style={{ color: "var(--gold)" }}>TIMING CHECK</h2>
        <p className="text-xs text-muted-fg mt-2">Use the headphones or speaker you play with. Tap the big button on every click (the first two are a count-in).</p>
        <button
          className="mx-auto mt-5 w-36 h-36 rounded-full border-4 font-pixel text-[10px] select-none touch-none transition-transform"
          style={{ borderColor: pulse >= 0 && state === "run" ? "var(--neon-pink)" : "var(--line)", transform: state === "run" && pulse >= 0 ? `scale(${pulse % 2 ? 1 : 1.04})` : undefined, background: "#0008" }}
          onPointerDown={(e) => { e.preventDefault(); if (state === "run") tap(); }}
          onClick={() => state !== "run" && start()}
        >
          {state === "run" ? (pulse < WARMUP ? `${Math.max(1, pulse + 1)}…` : "TAP") : state === "done" ? "AGAIN" : "START"}
        </button>
        {state === "done" && (result === null
          ? <p className="text-sm mt-4">Not enough taps landed near the clicks. Try once more.</p>
          : <p className="text-sm mt-4">Your taps land <b>{Math.abs(result)} ms {result >= 0 ? "late" : "early"}</b>. We'll shift the timing to match.</p>)}
        <p className="text-[11px] text-muted-fg mt-3">Current setting: {current === 0 ? "no adjustment" : <>{Math.abs(current)} ms {current > 0 ? "late" : "early"} · <button className="underline" onClick={() => set({ tapOffsetMs: 0 })}>reset</button></>}</p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button className="btn btn-ghost text-xs" disabled={state === "run"} onClick={onClose}>Close</button>
          <button className="btn btn-pink text-xs" disabled={result === null || state === "run"} onClick={save}>Save</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
