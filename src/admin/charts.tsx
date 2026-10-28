// Small, dependency-free charts for the admin. Single series each, so no legend: the card title names it.
import { useState } from "react";

const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString());

/** Vertical bars over days. Hover a bar to see the exact value. */
export function DayBars({ data, color = "var(--electric)", height = 140, label, showTotal = true }: { data: { day: string; value: number }[]; color?: string; height?: number; label: string; showTotal?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = max >= 2 ? [0, Math.ceil(max / 2), max] : [0, max];
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <figure aria-label={label}>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-muted-fg tabular-nums text-right w-8 shrink-0" style={{ height }}>
          {[...ticks].reverse().map((t, i) => <span key={i}>{fmt(t)}</span>)}
        </div>
        <div className="relative flex-1 min-w-0" style={{ height }}>
          {ticks.map((t, i) => (
            <div key={i} className="absolute inset-x-0 border-t border-dashed" style={{ bottom: `${(t / max) * 100}%`, borderColor: "color-mix(in oklch, var(--border) 70%, transparent)" }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => (
              <div key={d.day} className="flex-1 h-full flex items-end relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className="w-full rounded-t-[3px] transition-opacity" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0, background: color, opacity: hover === null || hover === i ? 1 : 0.45 }} />
                {hover === i && (
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 panel px-2 py-1 text-[11px] whitespace-nowrap z-10 pointer-events-none">
                    <b className="tabular-nums">{d.value.toLocaleString()}</b> <span className="text-muted-fg">{new Date(d.day + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-fg mt-1 pl-10">
        <span>{data[0] && new Date(data[0].day + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}</span>
        <span>{showTotal ? `Total ${total.toLocaleString()}` : ""}</span>
        <span>{data.length > 0 && new Date(data[data.length - 1].day + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}</span>
      </div>
    </figure>
  );
}

/** Horizontal ranked bars with direct value labels. */
export function RankBars({ rows, color = "var(--neon-pink)", empty }: { rows: { label: string; value: number }[]; color?: string; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-fg py-6 text-center">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted-fg">{r.label}</span>
          <span className="h-3 rounded-r-[4px] bg-black/30 overflow-hidden"><span className="block h-full rounded-r-[4px]" style={{ width: `${(r.value / max) * 100}%`, background: color }} /></span>
          <span className="tabular-nums text-xs w-16 text-right">{r.value.toLocaleString()} <span className="text-muted-fg">{Math.round((r.value / total) * 100)}%</span></span>
        </li>
      ))}
    </ul>
  );
}
