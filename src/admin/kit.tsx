// Shared building blocks for admin screens.
import { toast } from "../components/ui";

export const errMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "Something went wrong.");
export const fail = (e: unknown) => toast({ ok: false, message: errMsg(e) });
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

export function Section({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-5 mb-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {sub && <p className="text-xs text-muted-fg mt-1 max-w-prose">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-fg">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-2">{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div className="text-xs text-muted-fg mt-1">{sub}</div>}
    </div>
  );
}

export const input = "w-full px-3 py-2 rounded bg-black/40 border border-line outline-none focus:border-pink text-sm";

