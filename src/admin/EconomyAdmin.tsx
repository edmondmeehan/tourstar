// Admin → Economy: what the reward points you've handed out are worth, what you owe, and whether
// the game earns more per player than its prizes cost. Numbers come from public.admin_economy().
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { toast } from "../components/ui";
import { DayBars } from "./charts";
import { Kpi, Section, fail, input } from "./kit";

interface Econ {
  settings: { redeem_rate: number; alert_usd: number };
  earned: number; spent: number; outstanding: number; withheld: number;
  players: number; active_30d: number; active_7d: number;
  cost_per_point: number | null; redeem_rate: number; redeem_rate_is_actual: boolean;
  liability_usd: number; owed_items_usd: number; owed_raffles_usd: number;
  revenue_30d: number; payers_30d: number; prize_cost_30d: number;
  weeks: { week: string; redeemed_points: number; raffle_points: number; prize_usd: number; revenue_usd: number }[];
  items: { id: string; emoji: string; name: string; cost_points: number; active: boolean; cost_usd: number | null; usd_per_1000: number | null; redeemed: number }[];
  snapshots: { day: string; earned: number; spent: number; outstanding: number; liability_usd: number | null; active_30d: number }[];
}

const usd = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const pts = (n: number) => Number(n).toLocaleString("en-US");

export function EconomyTab() {
  const [e, setE] = useState<Econ | null>(null);
  const [rate, setRate] = useState("50");
  const [alertAt, setAlertAt] = useState("5000");

  const load = useCallback(async () => {
    const { data, error } = await supabase!.rpc("admin_economy");
    if (error) return fail(error);
    const d = data as Econ;
    setE(d);
    setRate(String(Math.round((d.settings.redeem_rate ?? 0.5) * 100)));
    setAlertAt(String(d.settings.alert_usd ?? 5000));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveSettings = async () => {
    const r = Math.min(100, Math.max(0, Number(rate))) / 100;
    const a = Math.max(0, Number(alertAt));
    const { error } = await supabase!.from("admin_settings").upsert({ key: "economy", value: { redeem_rate: r, alert_usd: a }, updated_at: new Date().toISOString() });
    if (error) return fail(error);
    toast({ ok: true, message: "Saved." });
    void load();
  };

  if (!e) return <p className="text-sm text-muted-fg">Loading…</p>;

  const cpp = e.cost_per_point === null ? null : Number(e.cost_per_point);
  const owedNow = Number(e.owed_items_usd) + Number(e.owed_raffles_usd);
  const totalExposure = Number(e.liability_usd) + owedNow;
  const prizePerActive = e.active_30d ? Number(e.prize_cost_30d) / e.active_30d : 0;
  const revPerActive = e.active_30d ? Number(e.revenue_30d) / e.active_30d : 0;
  const margin = revPerActive - prizePerActive;
  const missingCosts = e.items.filter((i) => i.active && i.cost_usd === null);

  // Points earned per active player per day, from the daily snapshots (needs a few days of history).
  const snaps = e.snapshots;
  const s0 = snaps.length > 1 ? snaps[Math.max(0, snaps.length - 8)] : null;
  const s1 = snaps[snaps.length - 1];
  const days = s0 && s1 ? Math.max(1, (Date.parse(s1.day) - Date.parse(s0.day)) / 864e5) : 0;
  const earnPerPlayerDay = s0 && s1 && e.active_7d ? (s1.earned - s0.earned) / days / e.active_7d : null;

  const alerts: string[] = [];
  if (totalExposure > Number(e.settings.alert_usd)) alerts.push(`What you could owe (${usd(totalExposure)}) is above your ${usd(e.settings.alert_usd)} alert line.`);
  if (missingCosts.length) alerts.push(`${missingCosts.length} live reward${missingCosts.length > 1 ? "s have" : " has"} no cost entered (${missingCosts.map((i) => i.name).join(", ")}). Add it in Rewards store → Edit, or the dollar figures here are too low.`);
  if (e.revenue_30d > 0 && margin < 0) alerts.push(`Prizes cost more per active player (${usd(prizePerActive, 2)}) than the game earns (${usd(revPerActive, 2)}) over the last 30 days.`);
  if (e.withheld > 0) alerts.push(`${pts(e.withheld)} points are held for review in Rewards store → Points review.`);

  return (
    <>
      {alerts.length > 0 && (
        <div className="panel p-4 mb-5 border-gold text-sm space-y-1" style={{ borderColor: "var(--gold)" }} role="status">
          {alerts.map((a) => <p key={a}>⚠️ {a}</p>)}
        </div>
      )}

      <div className="grid sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Points outstanding" value={pts(e.outstanding)} sub={`${pts(e.earned)} earned · ${pts(e.spent)} spent`} />
        <Kpi label="Face value" value={cpp === null ? "Add costs" : usd(e.outstanding * cpp)} sub={cpp === null ? "Enter your cost on each reward" : `${usd(cpp * 1000, 2)} per 1,000 points`} />
        <Kpi label="Expected cost" value={usd(e.liability_usd)} sub={`if ${Math.round(e.redeem_rate * 100)}% get redeemed${e.redeem_rate_is_actual ? " (your actual rate)" : " (estimate)"}`} />
        <Kpi label="Owed right now" value={usd(owedNow)} sub={`${usd(e.owed_items_usd)} rewards to ship · ${usd(e.owed_raffles_usd)} open raffles`} />
      </div>

      <div className="grid sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Active players · 30d" value={pts(e.active_30d)} sub={`${pts(e.active_7d)} in the last 7 days · ${pts(e.players)} total`} />
        <Kpi label="Revenue / active player · 30d" value={usd(revPerActive, 2)} sub={`${usd(e.revenue_30d)} from ${pts(e.payers_30d)} paying player${e.payers_30d === 1 ? "" : "s"}`} />
        <Kpi label="Prize cost / active player · 30d" value={usd(prizePerActive, 2)} sub={`${usd(e.prize_cost_30d)} in rewards and drawn raffles`} />
        <Kpi label="Margin / active player" value={e.revenue_30d > 0 || e.prize_cost_30d > 0 ? usd(margin, 2) : "—"} sub={earnPerPlayerDay === null ? "Points per player per day shows after a few days" : `Players earn ~${Math.round(earnPerPlayerDay)} pts/day (${cpp ? usd(earnPerPlayerDay * cpp * 30, 2) : "—"}/month face value)`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section title="Prize cost per week" sub="Your cost of rewards redeemed each week (last 12 weeks).">
          <DayBars data={e.weeks.map((w) => ({ day: w.week, value: Math.round(Number(w.prize_usd)) }))} color="var(--neon-pink)" label="Prize cost per week, US dollars" />
        </Section>
        <Section title="App Store revenue per week" sub="From RevenueCat (needs the webhook set up in Integrations).">
          <DayBars data={e.weeks.map((w) => ({ day: w.week, value: Math.round(Number(w.revenue_usd)) }))} color="var(--gold)" label="Revenue per week, US dollars" />
        </Section>
        <Section title="Points spent per week" sub="Points used on rewards and raffle tickets.">
          <DayBars data={e.weeks.map((w) => ({ day: w.week, value: Number(w.redeemed_points) + Number(w.raffle_points) }))} color="var(--electric)" label="Points spent per week" />
        </Section>
        <Section title="Points outstanding over time" sub="Recorded each day you open this tab.">
          {snaps.length < 2 ? <p className="text-sm text-muted-fg">Builds up from today. Check back in a few days.</p>
            : <DayBars data={snaps.map((s) => ({ day: s.day, value: Number(s.outstanding) }))} color="var(--electric)" label="Points outstanding by day" showTotal={false} />}
        </Section>
      </div>

      <Section title="What each reward costs you" sub="Lower dollars per 1,000 points = cheaper for you. Weight your store toward rewards with high perceived value and low cost.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px] [&_th]:px-3 [&_td]:px-3">
            <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
              <tr className="border-b border-line"><th className="py-2">Reward</th><th className="text-right">Points</th><th className="text-right">Your cost</th><th className="text-right">$ / 1,000 pts</th><th className="text-right">Redeemed</th></tr>
            </thead>
            <tbody>
              {e.items.map((i) => (
                <tr key={i.id} className={`border-b border-line/50 ${i.active ? "" : "opacity-50"}`}>
                  <td className="py-2">{i.emoji} {i.name}{!i.active && <span className="text-xs text-muted-fg"> · hidden</span>}</td>
                  <td className="text-right tabular-nums">{pts(i.cost_points)}</td>
                  <td className="text-right tabular-nums">{i.cost_usd === null ? <span className="text-gold text-xs">missing</span> : usd(i.cost_usd, 2)}</td>
                  <td className="text-right tabular-nums">{i.usd_per_1000 === null ? "—" : usd(i.usd_per_1000, 2)}</td>
                  <td className="text-right tabular-nums">{i.redeemed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {e.items.length === 0 && <p className="text-sm text-muted-fg text-center py-4">No rewards yet.</p>}
        </div>
      </Section>

      <Section title="Assumptions" sub="Used until you have real data. Once players have earned 50,000+ points, the actual share of points spent replaces your estimate.">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs text-muted-fg">Share of points that get redeemed (%)<input type="number" min={0} max={100} className={`${input} mt-1 w-32`} value={rate} onChange={(ev) => setRate(ev.target.value)} /></label>
          <label className="text-xs text-muted-fg">Alert me above ($ owed)<input type="number" min={0} className={`${input} mt-1 w-40`} value={alertAt} onChange={(ev) => setAlertAt(ev.target.value)} /></label>
          <button className="btn btn-ghost text-sm" onClick={saveSettings}>Save</button>
        </div>
        <p className="text-[11px] text-muted-fg mt-3">Levers if costs run hot: Balance → Reward points (×) and "Point-earning shows & releases per day", raise point prices or level gates on rewards, or add cheaper digital rewards. Points can never be bought, so this is a marketing cost, not deferred revenue. Confirm the accounting treatment with your accountant.</p>
      </Section>
    </>
  );
}
