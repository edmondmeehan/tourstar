// Admin: everyone who signed up for the beta on tourstarapp.com.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/cloud";
import { askConfirm } from "../components/ui";
import { Kpi, Section, fail, input, when } from "./kit";
import { RankBars } from "./charts";
import { WaitlistEmails } from "./WaitlistEmails";

interface Row { id: string; email: string; source: string | null; referrer: string | null; created_at: string; ref_code: string; referral_count: number; referred_by: string | null; welcome_sent_at: string | null; unsubscribed_at: string | null }

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
      const { data, error } = await supabase!.from("waitlist").select("id, email, source, referrer, created_at, ref_code, referral_count, referred_by, welcome_sent_at, unsubscribed_at")
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

  const invited = (rows ?? []).filter((r) => r.referred_by).length;
  const topReferrers = useMemo(() => [...(rows ?? [])].filter((r) => r.referral_count > 0)
    .sort((a, b) => b.referral_count - a.referral_count).slice(0, 10)
    .map((r) => ({ label: r.email, value: r.referral_count })), [rows]);
  const audience = (rows ?? []).filter((r) => !r.unsubscribed_at).length;

  const since = (days: number) => (rows ?? []).filter((r) => Date.parse(r.created_at) > Date.now() - days * 864e5).length;

  const csv = () => {
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const body = ["email,channel,form,referrer,signed_up,invite_code,invites,unsubscribed", ...filtered.map((r) => [r.email, channel(r), r.source?.split(":")[0] ?? "", r.referrer, r.created_at, r.ref_code, String(r.referral_count), r.unsubscribed_at ? "yes" : ""].map(esc).join(","))].join("\n");
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
      <div className="grid sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Beta signups" value={rows ? rows.length : "—"} />
        <Kpi label="Last 7 days" value={rows ? since(7) : "—"} />
        <Kpi label="Today" value={rows ? since(1) : "—"} />
        <Kpi label="Joined via invites" value={rows ? invited : "—"} sub={rows?.length ? `${Math.round((invited / rows.length) * 100)}% of the list` : undefined} />
      </div>

      <InviteStats />
      <Section title="Top referrers" sub="People whose invite links brought the most friends. Rewards at launch: 1 friend = +500 ⭐, 3 = Founding Fan badge + 1,500 ⭐, 10 = 5 launch-raffle tickets.">
        <RankBars rows={topReferrers} color="var(--gold)" empty="No referrals yet. Every new signup gets an invite link." />
      </Section>

      <WaitlistEmails audience={audience} />

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
              <table className="w-full text-sm min-w-[720px] [&_th]:px-3 [&_td]:px-3">
                <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
                  <tr className="border-b border-line"><th className="py-2 w-10">#</th><th>Email</th><th>Channel</th><th>Invites</th><th>Emails</th><th>Signed up</th><th /></tr>
                </thead>
                <tbody>
                  {filtered.slice(0, shown).map((r, i) => (
                    <tr key={r.id} className="border-b border-line/50">
                      <td className="py-2 text-muted-fg tabular-nums">{i + 1}</td>
                      <td><a className="hover:underline" href={`mailto:${r.email}`}>{r.email}</a></td>
                      <td className="text-muted-fg">{r.referred_by ? "invite" : channel(r)}</td>
                      <td className="tabular-nums">{r.referral_count || <span className="text-muted-fg">0</span>}</td>
                      <td className="text-[11px] whitespace-nowrap">{r.unsubscribed_at ? <span className="text-danger">Unsubscribed</span> : r.welcome_sent_at ? <span className="text-success">Welcomed</span> : <span className="text-muted-fg">—</span>}</td>
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

/** In-game player invites (codes entered, paid out, points granted). */
function InviteStats() {
  const [d, setD] = useState<{ codes_used: number; paid: number; points_granted: number; waitlist_rewards: number; top: { name: string; invites: number }[] } | null>(null);
  useEffect(() => { void supabase!.rpc("admin_invite_stats").then(({ data, error }) => { if (!error) setD(data as never); }); }, []);
  if (!d) return null;
  return (
    <Section title="Player invites" sub="In-game invite codes. A friend enters a code in their first week; when they play a show the inviter gets 300 points and the friend 200 (up to 20 paid invites per player). Waitlist rewards are added when the same email signs in.">
      <div className="grid sm:grid-cols-4 gap-3 mb-3">
        <Kpi label="Codes used" value={d.codes_used} />
        <Kpi label="Paid out" value={d.paid} sub="friend played a show" />
        <Kpi label="Points granted" value={d.points_granted} />
        <Kpi label="Waitlist rewards claimed" value={d.waitlist_rewards} />
      </div>
      {d.top.length > 0 && <RankBars rows={d.top.map((t) => ({ label: t.name, value: t.invites }))} color="var(--gold)" empty="" />}
    </Section>
  );
}
