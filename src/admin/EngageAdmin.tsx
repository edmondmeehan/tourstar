// Admin: Engagement & crashes (Overview), Leagues (Players → Leaderboard) and Tour events (Engage players).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { toast } from "../components/ui";
import { DayBars } from "./charts";
import { Kpi, Section, fail, input, when } from "./kit";
import { TOURS } from "../game/data";
import { STAGE_THEMES } from "../game/cosmetics";
import { BLANK_EVENT, parseEvent, type TourEvent } from "../lib/tourEvent";
import { TIERS } from "../lib/social";

interface Eng {
  days: number;
  daily: { day: string; active: number; new: number; shows: number; errors: number }[];
  funnel: Record<string, number>;
  retention: { d1: number; d1_base: number; d7: number; d7_base: number };
  tutorial_steps: Record<string, number>;
  errors: { msg: string; where: string | null; count: number; devices: number; version: string | null; last: string }[];
  calibrated: { players: number; avg_ms: number | null } | null;
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export function EngagementTab() {
  const [days, setDays] = useState(14);
  const [d, setD] = useState<Eng | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setD(null);
    void supabase!.rpc("admin_engagement", { p_days: days }).then(({ data, error }) => { if (error) setMissing(true); else setD(data as Eng); });
  }, [days]);
  if (missing) return <Section title="Engagement" sub="Run the engagement SQL in Supabase to turn this on."><p className="text-xs text-muted-fg">Not set up yet.</p></Section>;
  if (!d) return <p className="text-xs text-muted-fg">Loading…</p>;
  const f = d.funnel;
  const steps: [string, number][] = [
    ["Opened the app", f.opened], ["Created an artist", f.created], ["Reached the first stage", f.tutorial_show],
    ["Finished a show", f.first_show], ["Dropped a release", f.release], ["Played 3+ shows", f.three_shows], ["Signed in", f.signed_in],
  ];
  return (
    <>
      <Section title="New players" sub={`Devices that first opened the game in the last ${d.days} days, and how far they got.`} right={
        <select className={`${input} !w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 14, 30, 60].map((n) => <option key={n} value={n}>{n} days</option>)}</select>}>
        <div className="grid sm:grid-cols-4 gap-3 mb-4">
          <Kpi label="New players" value={f.opened ?? 0} />
          <Kpi label="Reached first show" value={pct(f.first_show, f.opened)} />
          <Kpi label="Came back next day" value={pct(d.retention.d1, d.retention.d1_base)} sub={`${d.retention.d1} of ${d.retention.d1_base}`} />
          <Kpi label="Came back after a week" value={pct(d.retention.d7, d.retention.d7_base)} sub={`${d.retention.d7} of ${d.retention.d7_base}`} />
        </div>
        <ul className="space-y-1.5">
          {steps.map(([label, n]) => (
            <li key={label} className="text-sm">
              <div className="flex justify-between"><span>{label}</span><span className="tabular-nums text-muted-fg">{n ?? 0} · {pct(n ?? 0, f.opened)}</span></div>
              <div className="h-2 rounded bg-black/40 overflow-hidden mt-1"><div className="h-full" style={{ width: f.opened ? `${((n ?? 0) / f.opened) * 100}%` : 0, background: "var(--electric)" }} /></div>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-fg mt-3">Mo's walkthrough: {f.tutorial_done} finished, {f.tutorial_skip} skipped. Step reached: {Object.entries(d.tutorial_steps).sort().map(([s, n]) => `${s}: ${n}`).join(" · ") || "—"}</p>
      </Section>
      <Section title="Every day" sub="Players who opened the game, new players, shows played and errors.">
        <div className="grid md:grid-cols-2 gap-6">
          <DayBars label="Active players" data={d.daily.map((x) => ({ day: x.day, value: x.active }))} />
          <DayBars label="Shows played" color="var(--neon-pink)" data={d.daily.map((x) => ({ day: x.day, value: x.shows }))} />
        </div>
      </Section>
      <Section title="Crashes and errors (7 days)" sub="Grouped by message. 'Build' matches the TestFlight build that reported it.">
        {d.errors.length === 0 ? <p className="text-xs text-muted-fg">No errors reported. 🎉</p> : (
          <ul className="divide-y divide-line text-sm">
            {d.errors.map((e) => (
              <li key={e.msg} className="py-2">
                <div className="font-mono text-xs break-all">{e.msg}</div>
                <div className="text-[11px] text-muted-fg mt-1">{e.count}× on {e.devices} device{e.devices === 1 ? "" : "s"} · last {when(e.last)}{e.where ? ` · ${e.where}` : ""}{e.version ? ` · build ${e.version}` : ""}</div>
              </li>
            ))}
          </ul>
        )}
        {d.calibrated && d.calibrated.players > 0 && <p className="text-[11px] text-muted-fg mt-3">Timing check used by {d.calibrated.players} players (average {d.calibrated.avg_ms} ms).</p>}
      </Section>
    </>
  );
}

export function LeaguesAdmin() {
  const [d, setD] = useState<{ week: string; tiers: { tier: number; players: number; leagues: number }[]; last: { week: string; players: number; up: number; down: number; gold: number }[] } | null>(null);
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [push, setPush] = useState(true);
  const [missing, setMissing] = useState(false);
  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase!.rpc("admin_leagues"),
      supabase!.from("app_public_config").select("key, value").in("key", ["league_rewards_enabled", "league_gold_per_tier", "league_size", "festival_goals"]),
      supabase!.from("admin_settings").select("value").eq("key", "league_push").maybeSingle(),
    ]);
    if (a.error) { setMissing(true); return; }
    setD(a.data);
    setCfg(Object.fromEntries((b.data ?? []).map((x) => [x.key, String(x.value)])));
    setPush((c.data?.value as { enabled?: boolean } | null)?.enabled !== false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async (key: string, value: string) => {
    const { error } = await supabase!.from("app_public_config").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) return fail(error);
    toast({ ok: true, message: "Saved." }); void load();
  };
  const savePush = async (on: boolean) => {
    const { error } = await supabase!.from("admin_settings").upsert({ key: "league_push", value: { enabled: on }, updated_at: new Date().toISOString() });
    if (error) return fail(error);
    setPush(on);
  };
  if (missing) return <Section title="Weekly leagues" sub="Run the engagement SQL in Supabase to turn this on."><p className="text-xs text-muted-fg">Not set up yet.</p></Section>;
  if (!d) return null;
  return (
    <Section title="Weekly leagues" sub="Players are grouped into leagues of about 30 at their division. Each Monday the top 20% move up, the bottom 20% (and anyone who didn't play) move down, and the top 3 win Gold.">
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        {TIERS.map((t) => { const x = d.tiers.find((y) => y.tier === t.tier); return <Kpi key={t.tier} label={`${t.emoji} ${t.name}`} value={x?.players ?? 0} sub={`${x?.leagues ?? 0} league${x?.leagues === 1 ? "" : "s"}`} />; })}
      </div>
      <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
        <label className="text-xs text-muted-fg flex items-center gap-2"><input type="checkbox" className="accent-[var(--neon-pink)]" checked={cfg.league_rewards_enabled !== "false"} onChange={(e) => void save("league_rewards_enabled", e.target.checked ? "true" : "false")} /> Pay Gold to each league's top 3</label>
        <label className="text-xs text-muted-fg flex items-center gap-2"><input type="checkbox" className="accent-[var(--neon-pink)]" checked={push} onChange={(e) => void savePush(e.target.checked)} /> Push "you just got passed" alerts</label>
        <label className="text-xs text-muted-fg">Gold per division (1st gets 3×, 2nd 2×, 3rd 1×, times the division number)
          <input className={`${input} mt-1`} inputMode="numeric" defaultValue={cfg.league_gold_per_tier ?? "20"} onBlur={(e) => { const v = String(Math.max(0, Math.min(500, Number(e.target.value) || 0))); if (v !== cfg.league_gold_per_tier) void save("league_gold_per_tier", v); }} /></label>
        <label className="text-xs text-muted-fg">Players per league
          <input className={`${input} mt-1`} inputMode="numeric" defaultValue={cfg.league_size ?? "30"} onBlur={(e) => { const v = String(Math.max(10, Math.min(100, Number(e.target.value) || 30))); if (v !== cfg.league_size) void save("league_size", v); }} /></label>
        <label className="text-xs text-muted-fg sm:col-span-2">Festival bill goals (shows by a player and their friends in a week)
          <input className={`${input} mt-1`} defaultValue={(() => { try { return (JSON.parse(cfg.festival_goals ?? "[10,25,50]") as number[]).join(", "); } catch { return "10, 25, 50"; } })()} onBlur={(e) => {
            const g = e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0).slice(0, 3).sort((a, b) => a - b);
            if (g.length === 3) void save("festival_goals", JSON.stringify(g)); else toast({ ok: false, message: "Enter three numbers, like 10, 25, 50." });
          }} /></label>
      </div>
      {d.last.length > 0 && (
        <ul className="text-xs text-muted-fg mt-4 space-y-1">
          {d.last.map((w) => <li key={w.week}>Week of {w.week}: {w.players} players · {w.up} promoted · {w.down} relegated · {w.gold.toLocaleString()} Gold paid</li>)}
        </ul>
      )}
    </Section>
  );
}

const toLocal = (iso: string) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");

export function TourEventsAdmin() {
  const [saved, setSaved] = useState<TourEvent | null>(null);
  const [f, setF] = useState<TourEvent>(BLANK_EVENT);
  const [claims, setClaims] = useState<number | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase!.from("app_public_config").select("value").eq("key", "tour_event").maybeSingle();
    const e = parseEvent(data?.value ?? null);
    setSaved(e); setF(e ?? BLANK_EVENT);
    if (e) {
      const { count } = await supabase!.from("tour_event_claims").select("*", { count: "exact", head: true }).eq("event_id", e.id);
      setClaims(count ?? 0);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const set = (p: Partial<TourEvent>) => setF((x) => ({ ...x, ...p }));
  const setV = (p: Partial<TourEvent["venue"]>) => setF((x) => ({ ...x, venue: { ...x.venue, ...p } }));
  const badge = f.reward.find((r) => r.type === "badge") as { type: "badge"; emoji: string; name?: string } | undefined;
  const title = f.reward.find((r) => r.type === "title") as { type: "title"; name: string } | undefined;
  const setReward = (b: { emoji: string; name: string } | null, t: string | null) => {
    const r: TourEvent["reward"] = [];
    if (b && b.emoji) r.push({ type: "badge", emoji: b.emoji, name: b.name });
    if (t) r.push({ type: "title", name: t });
    set({ reward: r });
  };

  const save = async (next: TourEvent) => {
    if (!next.name.trim()) return toast({ ok: false, message: "Give the event a name." });
    if (!next.starts || !next.ends || Date.parse(next.ends) <= Date.parse(next.starts)) return toast({ ok: false, message: "Set a start and an end after it." });
    if (!next.venue.name.trim()) return toast({ ok: false, message: "Name the event venue." });
    const row = { ...next, id: next.id || `${next.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${Date.now().toString(36)}` };
    const { error } = await supabase!.from("app_public_config").upsert({ key: "tour_event", value: JSON.stringify(row), updated_at: new Date().toISOString() });
    if (error) return fail(error);
    toast({ ok: true, message: row.enabled ? "Live for players (they see it on their next launch)." : "Saved. The event is off." });
    void load();
  };
  const fresh = () => setF({ ...BLANK_EVENT, id: "", starts: new Date().toISOString(), ends: new Date(Date.now() + 14 * 864e5).toISOString() });

  return (
    <Section title="Tour event" sub="A limited-time stage with bonus pay and fame. Players who play it enough times during the event earn a collectible badge and title that never comes back. One event at a time." right={<button className="btn btn-ghost text-xs" onClick={fresh}>New event</button>}>
      {saved && <p className="text-xs text-muted-fg mb-3">Current: <b className="text-fg">{saved.emoji} {saved.name}</b> · {saved.enabled ? "on" : "off"} · {when(saved.starts)} to {when(saved.ends)}{claims !== null ? ` · ${claims} collected` : ""}</p>}
      <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" className="accent-[var(--neon-pink)]" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Event is on</label>
      <div className="grid sm:grid-cols-[80px_1fr] gap-3">
        <label className="text-xs text-muted-fg">Emoji<input className={`${input} mt-1`} value={f.emoji} maxLength={8} onChange={(e) => set({ emoji: e.target.value })} /></label>
        <label className="text-xs text-muted-fg">Event name<input className={`${input} mt-1`} value={f.name} maxLength={50} placeholder="Halloween Haunt Tour" onChange={(e) => set({ name: e.target.value })} /></label>
      </div>
      <label className="block text-xs text-muted-fg mt-3">One line for players<input className={`${input} mt-1`} value={f.blurb} maxLength={200} placeholder="Play the haunted mansion for double pay and a spooky badge." onChange={(e) => set({ blurb: e.target.value })} /></label>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <label className="text-xs text-muted-fg">Starts<input type="datetime-local" className={`${input} mt-1`} value={toLocal(f.starts)} onChange={(e) => set({ starts: fromLocal(e.target.value) })} /></label>
        <label className="text-xs text-muted-fg">Ends<input type="datetime-local" className={`${input} mt-1`} value={toLocal(f.ends)} onChange={(e) => set({ ends: fromLocal(e.target.value) })} /></label>
      </div>
      <div className="font-pixel text-[8px] text-muted-fg mt-5 mb-2">EVENT STAGE</div>
      <div className="grid sm:grid-cols-[80px_1fr_1fr] gap-3">
        <label className="text-xs text-muted-fg">Emoji<input className={`${input} mt-1`} value={f.venue.emoji} maxLength={8} onChange={(e) => setV({ emoji: e.target.value })} /></label>
        <label className="text-xs text-muted-fg">Venue name<input className={`${input} mt-1`} value={f.venue.name} maxLength={50} placeholder="The Haunted Mansion" onChange={(e) => setV({ name: e.target.value })} /></label>
        <label className="text-xs text-muted-fg">Size (level needed)
          <select className={`${input} mt-1`} value={f.venue.base_tour} onChange={(e) => setV({ base_tour: e.target.value })}><option value="auto">Each player's biggest stage (everyone can play)</option>{TOURS.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name} (LV{t.level})</option>)}</select></label>
      </div>
      <div className="grid sm:grid-cols-4 gap-3 mt-3">
        <label className="text-xs text-muted-fg">Extra pay %<input className={`${input} mt-1`} inputMode="numeric" value={f.venue.pay_bonus} onChange={(e) => setV({ pay_bonus: Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0) })} /></label>
        <label className="text-xs text-muted-fg">Extra fame %<input className={`${input} mt-1`} inputMode="numeric" value={f.venue.fame_bonus} onChange={(e) => setV({ fame_bonus: Math.min(50, Number(e.target.value.replace(/\D/g, "")) || 0) })} /></label>
        <label className="text-xs text-muted-fg">Shows to earn it<input className={`${input} mt-1`} inputMode="numeric" value={f.goal} onChange={(e) => set({ goal: Math.max(1, Math.min(50, Number(e.target.value.replace(/\D/g, "")) || 1)) })} /></label>
        <label className="text-xs text-muted-fg">Stage look
          <select className={`${input} mt-1`} value={f.venue.theme ?? ""} onChange={(e) => setV({ theme: e.target.value || null })}><option value="">Player's own</option>{STAGE_THEMES.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}</select></label>
      </div>
      <div className="font-pixel text-[8px] text-muted-fg mt-5 mb-2">COLLECTIBLE</div>
      <div className="grid sm:grid-cols-[80px_1fr_1fr] gap-3">
        <label className="text-xs text-muted-fg">Badge<input className={`${input} mt-1`} value={badge?.emoji ?? ""} maxLength={8} placeholder="🎃" onChange={(e) => setReward({ emoji: e.target.value, name: badge?.name ?? "" }, title?.name ?? null)} /></label>
        <label className="text-xs text-muted-fg">Badge name<input className={`${input} mt-1`} value={badge?.name ?? ""} maxLength={30} placeholder="Haunt 2026" onChange={(e) => setReward({ emoji: badge?.emoji ?? "", name: e.target.value }, title?.name ?? null)} /></label>
        <label className="text-xs text-muted-fg">Title (optional)<input className={`${input} mt-1`} value={title?.name ?? ""} maxLength={30} placeholder="Ghost of the Stage" onChange={(e) => setReward(badge ? { emoji: badge.emoji, name: badge.name ?? "" } : null, e.target.value || null)} /></label>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn btn-pink" onClick={() => void save(f)}>Save</button>
        {saved && <button className="btn btn-ghost text-xs" onClick={() => setF(saved)}>Discard changes</button>}
      </div>
      <p className="text-[11px] text-muted-fg mt-3">Players get a phone alert the day before it ends if they haven't earned the collectible yet. Signed-in players keep the collectible on every device.</p>
    </Section>
  );
}

/** Title screen season: follows the calendar by default (Halloween in October, Harvest Nov 1–24, Holidays Nov 25–Jan 1). */
export function TitleSeasonAdmin() {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    void supabase!.from("app_public_config").select("value").eq("key", "title_season").maybeSingle().then(({ data }) => setV(String(data?.value ?? "auto")));
  }, []);
  const save = async (value: string) => {
    const { error } = await supabase!.from("app_public_config").upsert({ key: "title_season", value, updated_at: new Date().toISOString() });
    if (error) return fail(error);
    setV(value);
    toast({ ok: true, message: "Saved. Players see it next time they open the game." });
  };
  if (v === null) return null;
  return (
    <Section title="Title screen season" sub="The title screen dresses up for the season: Halloween (Oct 1–31), Harvest for Thanksgiving (Nov 1–24) and Holidays (Nov 25–Jan 1). Pin one, or switch it off.">
      <select className={`${input} max-w-xs`} value={v} onChange={(e) => void save(e.target.value)}>
        <option value="auto">Follow the calendar</option>
        <option value="halloween">🎃 Halloween</option>
        <option value="harvest">🍂 Harvest (Thanksgiving)</option>
        <option value="holiday">❄️ Holidays</option>
        <option value="none">Off (regular sunset)</option>
      </select>
    </Section>
  );
}
