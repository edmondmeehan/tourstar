// Admin: tourstarapp.com waitlist signups.
import { useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { Section, fail, when } from "./kit";
import { RankBars } from "./charts";

interface Row { email: string; source: string | null; referrer: string | null; created_at: string }

export function WaitlistSection() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    supabase!.from("waitlist").select("email, source, referrer, created_at").order("created_at", { ascending: false }).limit(5000)
      .then(({ data, error }) => (error ? fail(error) : setRows(data as Row[])));
  }, []);

  const bySource = Object.entries((rows ?? []).reduce<Record<string, number>>((acc, r) => {
    const host = (() => { try { return r.referrer ? new URL(r.referrer).hostname.replace(/^www\./, "") : null; } catch { return null; } })();
    const k = r.source?.split(":")[1] || host || "direct";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const week = (rows ?? []).filter((r) => Date.parse(r.created_at) > Date.now() - 7 * 864e5).length;

  const csv = () => {
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const body = ["email,source,referrer,joined", ...(rows ?? []).map((r) => [r.email, r.source, r.referrer, r.created_at].map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
    a.download = `tourstar-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Section title="Waitlist" sub="Signups from tourstarapp.com. Tag links with ?utm_source=instagram (or tiktok, email…) to see which channels work."
      right={rows && rows.length > 0 ? <button className="btn btn-ghost text-sm" onClick={csv}>Download CSV</button> : undefined}>
      {!rows ? <p className="text-sm text-muted-fg">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">No signups yet.</p> : (
        <div className="grid md:grid-cols-[200px_1fr_1fr] gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-fg">Total</div>
            <div className="text-3xl font-bold tabular-nums mt-1">{rows.length.toLocaleString()}</div>
            <div className="text-xs text-muted-fg mt-1">+{week.toLocaleString()} this week</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-fg mb-3">Where they came from</div>
            <RankBars rows={bySource} empty="No data" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-fg mb-3">Latest</div>
            <ul className="text-sm space-y-1.5">
              {rows.slice(0, 6).map((r) => (
                <li key={r.email} className="flex justify-between gap-3"><span className="truncate">{r.email}</span><span className="text-xs text-muted-fg shrink-0">{when(r.created_at)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Section>
  );
}
