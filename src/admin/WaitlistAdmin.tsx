// Admin: everyone who signed up for the beta on tourstarapp.com.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/cloud";
import { askConfirm } from "../components/ui";
import { Kpi, Section, fail, input, when } from "./kit";
import { RankBars } from "./charts";

interface Row { id: string; email: string; source: string | null; referrer: string | null; created_at: string }

/** "hero:instagram" → instagram; otherwise the referring site, otherwise direct. */
function channel(r: Row) {
  const tag = r.source?.split(":")[1];
  if (tag) return tag;
  try { if (r.referrer) return new URL(r.referrer).hostname.replace(/^www\./, ""); } catch { /* bad referrer */ }
  return "direct";
}
const PAGE = 100;

export function BetaSignupsTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    const all: Row[] = [];
    // Page through in chunks of 1,000 (the API's per-request cap).
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase!.from("waitlist").select("id, email, source, referrer, created_at")
        .order("created_at", { ascending: false }).range(from, from + 999);
      if (error) return fail(error);
      all.push(...(data as Row[]));
      if (!data || data.length < 1000) break;
    }
    setRows(all);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !s || r.email.includes(s) || channel(r).toLowerCase().includes(s));
  }, [rows, q]);

  const bySource = useMemo(() => Object.entries((rows ?? []).reduce<Record<string, number>>((acc, r) => {
    const k = channel(r);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8), [rows]);

  const since = (days: number) => (rows ?? []).filter((r) => Date.parse(r.created_at) > Date.now() - days * 864e5).length;

  const csv = () => {
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const body = ["email,channel,form,referrer,signed_up", ...filtered.map((r) => [r.email, channel(r), r.source?.split(":")[0] ?? "", r.referrer, r.created_at].map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
    a.download = `tourstar-beta-signups-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const remove = (r: Row) => askConfirm(`Remove ${r.email} from the beta list? Do this if they asked to be removed.`, async () => {
    const { error } = await supabase!.from("waitlist").delete().eq("id", r.id);
    if (error) return fail(error);
    setRows((cur) => (cur ?? []).filter((x) => x.id !== r.id));
  }, { yes: "Remove", danger: true });

  return (
    <>
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Kpi label="Beta signups" value={rows ? rows.length : "—"} />
        <Kpi label="Last 7 days" value={rows ? since(7) : "—"} />
        <Kpi label="Today" value={rows ? since(1) : "—"} />
      </div>

      <Section title="Where they came from" sub="Tag the links you post with ?utm_source=instagram (or tiktok, email, newsletter…) to see which channels bring signups.">
        <RankBars rows={bySource} empty="No signups yet." />
      </Section>

      <Section title="Everyone on the list" sub="People who signed up on tourstarapp.com for early access."
        right={
          <div className="flex gap-2 items-center">
            <input className={`${input} w-56`} placeholder="Search email or channel" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} aria-label="Search signups" />
            <button className="btn btn-ghost text-sm" disabled={!filtered.length} onClick={csv}>Download CSV</button>
          </div>
        }>
        {!rows ? <p className="text-sm text-muted-fg">Loading…</p> : filtered.length === 0 ? <p className="text-sm text-muted-fg text-center py-8">{rows.length ? "No matches." : "No signups yet. Share tourstarapp.com to get the list going."}</p> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px] [&_th]:px-3 [&_td]:px-3">
                <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
                  <tr className="border-b border-line"><th className="py-2 w-10">#</th><th>Email</th><th>Channel</th><th>Signed up</th><th /></tr>
                </thead>
                <tbody>
                  {filtered.slice(0, shown).map((r, i) => (
                    <tr key={r.id} className="border-b border-line/50">
                      <td className="py-2 text-muted-fg tabular-nums">{i + 1}</td>
                      <td><a className="hover:underline" href={`mailto:${r.email}`}>{r.email}</a></td>
                      <td className="text-muted-fg">{channel(r)}</td>
                      <td className="text-muted-fg whitespace-nowrap">{when(r.created_at)}</td>
                      <td className="text-right"><button className="text-xs underline text-muted-fg hover:text-danger" onClick={() => remove(r)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center mt-3 text-xs text-muted-fg">
              <span>Showing {Math.min(shown, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}</span>
              {shown < filtered.length && <button className="underline" onClick={() => setShown(shown + PAGE)}>Show more</button>}
            </div>
          </>
        )}
      </Section>
    </>
  );
}
