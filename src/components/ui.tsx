import { create } from "zustand";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { STAT_META } from "../game/data";
import { fmtMoney, fmtNum } from "../game/engine";
import type { Delta, Stats } from "../game/types";
import type { ActionResult } from "../game/store";
import { sfx } from "../lib/fx";

/* ---------- Toasts ---------- */
interface Toast { id: number; title?: string; message: string; ok: boolean; delta?: Delta }
const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, "id">) => void; drop: (id: number) => void }>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3200);
  },
  drop: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function toast(r: ActionResult | string) {
  const res: ActionResult = typeof r === "string" ? { ok: true, message: r } : r;
  useToasts.getState().push({ ok: res.ok, title: res.title, message: res.message, delta: res.delta });
  if (res.ok) {
    sfx(res.delta?.cash && res.delta.cash > 0 ? "coin" : "click");
  } else {
    sfx("bad");
  }
}

export function Toaster() {
  const { toasts, drop } = useToasts();
  return (
    <div style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }} className="fixed inset-x-0 z-[90] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => drop(t.id)}
          className="pointer-events-auto panel w-full max-w-sm px-4 py-3 text-left animate-slide-up"
          style={{ borderColor: t.ok ? "var(--electric)" : "var(--danger)" }}
        >
          {t.title && <div className="font-pixel text-[10px] mb-1" style={{ color: t.ok ? "var(--gold)" : "var(--danger)" }}>{t.title}</div>}
          <div className="text-sm">{t.message}</div>
          {t.delta && <DeltaChips delta={t.delta} className="mt-2" />}
        </button>
      ))}
    </div>
  );
}

/* ---------- Delta chips ---------- */
export function DeltaChips({ delta, className = "" }: { delta: Delta; className?: string }) {
  const entries = (Object.entries(delta) as [keyof Stats, number][]).filter(([, v]) => v);
  if (!entries.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {entries.map(([k, v]) => (
        <span key={k} className="text-[11px] px-1.5 py-0.5 rounded bg-black/40 border border-white/10" style={{ color: v > 0 ? "var(--success)" : "var(--danger)" }}>
          {STAT_META[k].icon} {v > 0 ? "+" : ""}{k === "cash" ? fmtMoney(Math.abs(v)).replace("$", v < 0 ? "-$" : "$") : fmtNum(v)}
        </span>
      ))}
    </div>
  );
}

/* ---------- Bars ---------- */
export function StatBar({ k, value }: { k: keyof Stats; value: number }) {
  const m = STAT_META[k];
  const pct = m.max ? (value / m.max) * 100 : 100;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted-fg mb-1">
        <span>{m.icon} {m.label}</span>
        <span className="text-fg">{k === "cash" ? fmtMoney(value) : m.max ? `${value}/${m.max}` : fmtNum(value)}</span>
      </div>
      {m.max && (
        <div className="h-2 rounded-full bg-black/50 overflow-hidden border border-white/5">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
        </div>
      )}
    </div>
  );
}

export function Bar({ pct, color = "var(--neon-pink)" }: { pct: number; color?: string }) {
  return (
    <div className="h-2.5 rounded-full bg-black/50 overflow-hidden border border-white/5">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 10px ${color}` }} />
    </div>
  );
}

/* ---------- Layout bits ---------- */
export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-4 gap-3">
      <div>
        <h1 className="font-pixel text-sm text-glow-pink" style={{ color: "var(--neon-pink)" }}>{title}</h1>
        {sub && <p className="text-xs text-muted-fg mt-2">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = "", glow, style }: { children: ReactNode; className?: string; glow?: "pink" | "blue" | "gold"; style?: CSSProperties }) {
  const border = glow === "pink" ? "var(--neon-pink)" : glow === "blue" ? "var(--electric)" : glow === "gold" ? "var(--gold)" : undefined;
  return <div className={`panel p-4 ${className}`} style={{ ...(border ? { borderColor: border } : {}), ...style }}>{children}</div>;
}

export function Tag({ children, color = "var(--muted-foreground)" }: { children: ReactNode; color?: string }) {
  return <span className="font-pixel text-[8px] px-1.5 py-1 rounded border" style={{ color, borderColor: color }}>{children}</span>;
}

export function Modal({ open, onClose, children, dismissable = true }: { open: boolean; onClose?: () => void; children: ReactNode; dismissable?: boolean }) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose, dismissable]);
  if (!open) return null;
  // Rendered on <body> so it always sits above the page (pages animate in with a transform, which
  // would otherwise trap the modal under the bottom bar and Mo's tips).
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => dismissable && onClose?.()}>
      <div className="panel w-full max-w-sm p-5 animate-pop max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Empty({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="text-center py-10 text-muted-fg">
      <div className="text-4xl mb-3">{emoji}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

/* ---------- In-page confirm (window.confirm is blocked in embedded viewers) ---------- */
interface ConfirmReq { message: string; yes: string; danger?: boolean; onYes: () => void }
const useConfirmStore = create<{ req: ConfirmReq | null; set: (r: ConfirmReq | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

export function askConfirm(message: string, onYes: () => void, opts: { yes?: string; danger?: boolean } = {}) {
  useConfirmStore.getState().set({ message, onYes, yes: opts.yes ?? "Confirm", danger: opts.danger });
}

export function ConfirmHost() {
  const { req, set } = useConfirmStore();
  return (
    <Modal open={!!req} onClose={() => set(null)}>
      {req && (
        <>
          <p className="text-sm mb-5">{req.message}</p>
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => set(null)}>Cancel</button>
            <button className={`btn flex-1 ${req.danger ? "btn-danger" : "btn-pink"}`} onClick={() => { const f = req.onYes; set(null); f(); }}>{req.yes}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
