import { useEffect, useState } from "react";
import { EVENTS } from "../game/events";
import { useGame } from "../game/store";
import { sfx, vibrate } from "../lib/fx";
import { DeltaChips, Modal, toast } from "./ui";
import { fmtMoney } from "../game/engine";
import { useConcert } from "../concert/useConcert";

export function EventModal() {
  const id = useGame((s) => s.career?.pendingEvent);
  const resolve = useGame((s) => s.resolveEvent);
  const concert = useConcert((s) => s.result);
  const ev = concert ? undefined : EVENTS.find((e) => e.id === id);
  useEffect(() => {
    if (ev) { sfx("event"); vibrate([30, 60, 30]); }
  }, [ev]);
  if (!ev) return null;
  return (
    <Modal open dismissable={false}>
      <div className="text-center">
        <div className="text-5xl mb-3">{ev.emoji}</div>
        <div className="font-pixel text-[9px] text-muted-fg uppercase mb-2">{ev.kind}</div>
        <h2 className="font-pixel text-sm mb-3" style={{ color: "var(--gold)" }}>{ev.title}</h2>
        <p className="text-sm text-fg/90 mb-5">{ev.text}</p>
        <div className="flex flex-col gap-2">
          {ev.choices.map((c, i) => (
            <button key={i} className={`btn ${i === 0 ? "btn-pink" : "btn-primary"}`} onClick={() => resolve(i)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function OutcomeModal() {
  const o = useGame((s) => s.lastOutcome);
  const clear = useGame((s) => s.clearOutcome);
  const concert = useConcert((s) => s.result);
  if (!o || concert) return null;
  return (
    <Modal open onClose={clear}>
      <div className="text-center">
        <h2 className="font-pixel text-xs mb-3" style={{ color: "var(--neon-pink)" }}>{o.title}</h2>
        <p className="text-sm mb-4">{o.text}</p>
        <DeltaChips delta={o.delta} className="justify-center mb-5" />
        <button className="btn btn-primary w-full" onClick={clear}>Continue</button>
      </div>
    </Modal>
  );
}

const LOCK_META = {
  jail: { emoji: "🚔", title: "IN JAIL", color: "var(--danger)" },
  rehab: { emoji: "🏥", title: "IN REHAB", color: "var(--electric)" },
  dropped: { emoji: "📉", title: "DROPPED BY LABEL", color: "var(--gold)" },
  cancelled: { emoji: "🚫", title: "CANCELLED", color: "var(--neon-pink)" },
};

export function LockoutOverlay() {
  const lock = useGame((s) => s.career?.lockout);
  const payBail = useGame((s) => s.payBail);
  const cash = useGame((s) => s.career?.stats.cash ?? 0);
  const [now, setNow] = useState(Date.now());
  const [hidden, setHidden] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const concert = useConcert((s) => s.result);
  if (!lock || lock.until <= now || hidden === lock.until || concert) return null;
  const m = LOCK_META[lock.kind];
  const left = Math.max(0, Math.ceil((lock.until - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-6 bg-black/85 backdrop-blur scanlines">
      <div className="text-center max-w-xs relative z-10">
        <div className="text-6xl mb-4">{m.emoji}</div>
        <h2 className="font-pixel text-base mb-3 crt-flicker" style={{ color: m.color }}>{m.title}</h2>
        <p className="text-sm text-muted-fg mb-6">{lock.reason}</p>
        <div className="font-pixel text-2xl mb-6" style={{ color: "var(--gold)" }}>{mm}:{ss}</div>
        {lock.bail && (
          <button className="btn btn-gold w-full mb-3" disabled={cash < lock.bail} onClick={() => toast(payBail())}>
            Pay bail · {fmtMoney(lock.bail)}
          </button>
        )}
        <button className="btn btn-ghost w-full" onClick={() => setHidden(lock.until)}>Look around (can't play)</button>
      </div>
    </div>
  );
}

export function CelebrationOverlay() {
  const concert = useConcert((s) => s.result);
  const first = useGame((s) => s.celebrations[0]);
  const c = concert ? undefined : first;
  const dismiss = useGame((s) => s.dismissCelebration);
  useEffect(() => {
    if (c) { sfx("levelup"); vibrate([60, 40, 60, 40, 120]); }
  }, [c]);
  if (!c) return null;
  const color = c.kind === "sellout" ? "var(--neon-pink)" : c.kind === "tour" ? "var(--electric)" : "var(--gold)";
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 overflow-hidden" onClick={dismiss}>
      <Confetti />
      <div className="text-center px-6 animate-pop relative z-10">
        <div className="font-pixel text-xl mb-4 crt-flicker" style={{ color, textShadow: `0 0 18px ${color}` }}>{c.title}</div>
        <div className="text-lg mb-8">{c.subtitle}</div>
        <div className="font-pixel text-[9px] text-muted-fg animate-press-start">TAP TO CONTINUE</div>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ["var(--neon-pink)", "var(--electric)", "var(--gold)", "var(--success)"];
export function Confetti({ count = 40 }: { count?: number }) {
  const [bits] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 3,
      dur: 2.5 + Math.random() * 3,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rot: Math.random() * 360,
    })),
  );
  return (
    <div className="absolute inset-0 pointer-events-none">
      {bits.map((b, i) => (
        <span key={i} className="confetti" style={{ left: `${b.left}%`, background: b.color, animationDelay: `-${b.delay}s`, animationDuration: `${b.dur}s`, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  );
}
