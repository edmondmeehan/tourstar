// Admin → Notifications & emails: the daily admin report (each admin opts in) and win-back emails for
// players who stop playing. Both are sent once a day (1 PM UTC) by the daily-jobs function.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { toast } from "../components/ui";
import { Kpi, Section, fail, input, when } from "./kit";

interface Run { id: number; job: string; sent: number; detail: string; created_at: string }

async function callJobs(body: Record<string, unknown>) {
  const { data, error } = await supabase!.functions.invoke("daily-jobs", { body });
  if (error) {
    let msg = "Couldn't send.";
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* keep default */ }
    return { error: msg };
  }
  return data as { ok?: boolean; to?: string; error?: string };
}

export function EmailJobsAdmin() {
  const [report, setReport] = useState<{ enabled: boolean } | null>(null);
  const [winback, setWinback] = useState<{ enabled: boolean; max_per_day: number } | null>(null);
  const [mine, setMine] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [max, setMax] = useState("300");
  const [busy, setBusy] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const [s, m, r] = await Promise.all([
      supabase!.from("admin_settings").select("key, value").in("key", ["daily_report", "winback"]),
      supabase!.rpc("admin_my_daily_report"),
      supabase!.from("daily_job_runs").select("*").order("created_at", { ascending: false }).limit(14),
    ]);
    if (m.error) { setMissing(true); return; }
    const map = Object.fromEntries((s.data ?? []).map((x) => [x.key, x.value]));
    setReport({ enabled: map.daily_report?.enabled === true });
    const w = { enabled: map.winback?.enabled === true, max_per_day: Number(map.winback?.max_per_day ?? 300) || 300 };
    setWinback(w); setMax(String(w.max_per_day));
    setMine(m.data === true);
    setRuns((r.data ?? []) as Run[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveSetting = async (key: "daily_report" | "winback", value: Record<string, unknown>) => {
    const { error } = await supabase!.from("admin_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) return fail(error);
    toast({ ok: true, message: "Saved." });
    void load();
  };
  const setMineOn = async (on: boolean) => {
    const { error } = await supabase!.rpc("admin_set_daily_report", { p_on: on });
    if (error) return fail(error);
    setMine(on);
    toast({ ok: true, message: on ? "You'll get the report every morning." : "You won't get the report." });
  };
  const test = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    const r = await callJobs({ action, ...extra });
    setBusy(null);
    toast(r.error ? { ok: false, message: r.error } : { ok: true, message: `Sent to ${r.to}.` });
  };

  if (missing) return <Section title="Daily emails" sub="Run the daily emails SQL in Supabase to turn this on."><p className="text-xs text-muted-fg">Not set up yet.</p></Section>;
  if (!report || !winback) return null;
  const sent7 = (job: string) => runs.filter((r) => r.job === job && Date.parse(r.created_at) > Date.now() - 7 * 864e5).reduce((a, r) => a + r.sent, 0);

  return (
    <>
      <Section title="Daily admin report" sub="One email every morning (about 9 AM New York): new accounts, players, App Store sales, merch, VIP, AI usage, and anything that needs a look. Each admin chooses whether they get it.">
        <Switch on={report.enabled} onChange={(v) => void saveSetting("daily_report", { enabled: v })} title="Send the daily report" note="Off = nobody gets it." />
        <Switch on={mine} onChange={(v) => void setMineOn(v)} title="Email it to me" note="Just for your admin account. Other admins turn it on for themselves." />
        <button className="btn btn-ghost text-xs mt-2" disabled={!!busy} onClick={() => void test("test_report")}>{busy === "test_report" ? "Sending…" : "Send me today's report now"}</button>
      </Section>

      <Section title="Win-back emails" sub="Friendly emails to signed-in players who stop playing: after 3, 7 and 14 days away, one each, using their artist name and stats. They stop as soon as the player comes back, and every email has a one-click stop link (players can also switch them off under Account).">
        <Switch on={winback.enabled} onChange={(v) => void saveSetting("winback", { ...winback, enabled: v })} title="Send win-back emails" note="Players who've been away more than 30 days aren't emailed. Admins are never emailed." />
        <div className="flex items-end gap-2 mt-2 max-w-sm">
          <label className="flex-1 text-xs text-muted-fg">Most emails per day<input className={`${input} mt-1`} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} /></label>
          <button className="btn btn-ghost text-xs" disabled={Number(max) === winback.max_per_day || !Number(max)} onClick={() => void saveSetting("winback", { ...winback, max_per_day: Math.min(1000, Number(max)) })}>Save</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {[1, 2, 3].map((s) => <button key={s} className="btn btn-ghost text-xs" disabled={!!busy} onClick={() => void test("test_winback", { stage: s })}>{busy === "test_winback" ? "Sending…" : `Email me sample ${s} (${["3 days", "7 days", "14 days"][s - 1]})`}</button>)}
        </div>
      </Section>

      <Section title="Recent runs" sub="What the daily job sent.">
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Kpi label="Reports sent (7 days)" value={sent7("daily_report")} />
          <Kpi label="Win-back emails (7 days)" value={sent7("winback")} />
        </div>
        {runs.length === 0 ? <p className="text-xs text-muted-fg">No runs yet. The first one happens at the next 1 PM UTC.</p> : (
          <ul className="divide-y divide-line text-sm">
            {runs.map((r) => (
              <li key={r.id} className="py-1.5 flex justify-between gap-3">
                <span>{r.job === "winback" ? "Win-back" : "Daily report"} · {r.sent} sent{r.detail ? <span className="text-danger text-xs"> · {r.detail}</span> : null}</span>
                <span className="text-[11px] text-muted-fg whitespace-nowrap">{when(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Switch({ on, onChange, title, note }: { on: boolean; onChange: (v: boolean) => void; title: string; note: string }) {
  return (
    <div className="flex items-start gap-4 py-2">
      <button role="switch" aria-checked={on} onClick={() => onChange(!on)}
        className={`w-10 h-6 rounded-full shrink-0 relative transition ${on ? "bg-[var(--neon-pink)]" : "bg-black/50 border border-line"}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-5" : "left-1"}`} />
      </button>
      <div><div className="text-sm font-semibold">{title}</div><div className="text-xs text-muted-fg mt-0.5">{note}</div></div>
    </div>
  );
}
