// TourStar admin. Only accounts in the `admins` table get past the gate; every query is also
// enforced server-side by row-level security and admin-only database functions.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, useCloud } from "../lib/cloud";
import { levelFor } from "../game/engine";
import { COPYRIGHT } from "../lib/site";
import { CONFIG_FIELDS, DEFAULT_CONFIG, levelThresholds, sanitizeConfig, type GameConfig } from "../game/config";
import { PLAYER_TYPES, fmtDays, simulateClimb } from "../game/sim";
import { EVENTS } from "../game/events";
import { GENRES, LEVELS, STAT_META } from "../game/data";
import { toast, askConfirm } from "../components/ui";
import { DayBars, RankBars } from "./charts";
import { Logo } from "../components/HeroBackdrop";
import { Kpi, Section, errMsg, fail, input, when } from "./kit";
import { RafflesTab, RewardsTab } from "./RewardsAdmin";
import { BetaSignupsTab } from "./WaitlistAdmin";
import { IntegrationsTab } from "./IntegrationsAdmin";
import { AiTab } from "./AiAdmin";
import { EconomyTab } from "./EconomyAdmin";
import { DropsTab } from "./DropsAdmin";
import { PartnersTab } from "./PartnersAdmin";
import { MonthlyTab } from "./MonthlyAdmin";
import { NotificationsTab, PresalesTab } from "./PresalesAdmin";
import { refreshSite, useSite } from "../lib/site";

type Tab = "insights" | "beta" | "players" | "finance" | "economy" | "marketing" | "balance" | "events" | "rewards" | "drops" | "partners" | "monthly" | "presales" | "push" | "raffles" | "traffic" | "music" | "integrations" | "admins";
const TABS: { id: Tab; label: string }[] = [
  { id: "insights", label: "Insights" },
  { id: "beta", label: "Beta signups" },
  { id: "players", label: "Players" },
  { id: "finance", label: "Finance" },
  { id: "economy", label: "Economy" },
  { id: "marketing", label: "Marketing" },
  { id: "balance", label: "Balance" },
  { id: "events", label: "Events & gifts" },
  { id: "rewards", label: "Rewards store" },
  { id: "drops", label: "Packs & Gold" },
  { id: "partners", label: "Partners & venues" },
  { id: "monthly", label: "Monthly release" },
  { id: "presales", label: "Presales" },
  { id: "push", label: "Notifications" },
  { id: "raffles", label: "Raffles" },
  { id: "traffic", label: "Traffic" },
  { id: "music", label: "AI audio" },
  { id: "integrations", label: "Integrations" },
  { id: "admins", label: "Admins" },
];

const levelName = (fame: number) => levelFor(fame);

// ================================================================= gate

export default function Admin() {
  const session = useCloud((s) => s.session);
  const [state, setState] = useState<"checking" | "yes" | "no">("checking");
  const [tab, setTab] = useState<Tab>(() => (sessionStorageGet("tourstar-admin-tab") as Tab) || "insights");

  useEffect(() => {
    if (!supabase || !session) { setState("no"); return; }
    setState("checking");
    supabase.rpc("claim_admin_invite").then(({ data, error }) => setState(!error && data ? "yes" : "no"));
  }, [session]);

  useEffect(() => { sessionStorageSet("tourstar-admin-tab", tab); }, [tab]);

  if (!supabase) return <Center>Accounts aren't configured in this build.</Center>;
  if (!session) return <Center>Sign in with an admin account to open the admin. <Link className="underline text-electric" to="/login?mode=signin">Sign in</Link></Center>;
  if (state === "checking") return <Center><span className="font-pixel text-[10px] animate-press-start text-gold">CHECKING ACCESS…</span></Center>;
  if (state === "no") return <Center>{session.user.email} isn't an admin. Ask an existing admin to add you, then confirm your email. <Link className="underline text-electric" to="/dashboard">Back to the game</Link></Center>;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <header className="border-b border-line px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-30" style={{ background: "color-mix(in oklch, var(--background) 92%, transparent)", backdropFilter: "blur(8px)", paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-3">
          <Logo size="xs" />
          <span className="font-pixel text-[9px] text-pink">ADMIN</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-fg">
          <span className="hidden sm:inline">{session.user.email}</span>
          <Link to="/dashboard" className="underline">Back to game</Link>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:flex gap-6">
        <nav className="lg:w-48 shrink-0 mb-5 lg:mb-0 flex lg:flex-col gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`text-left text-sm px-3 py-2 rounded whitespace-nowrap ${tab === t.id ? "bg-white/10 text-fg font-semibold" : "text-muted-fg hover:bg-white/5"}`}>
              {t.label}
            </button>
          ))}
          <p className="hidden lg:block text-[10px] text-muted-fg px-3 mt-6">{COPYRIGHT}</p>
        </nav>
        <main className="flex-1 min-w-0">
          {tab === "insights" && <Insights />}
          {tab === "beta" && <BetaSignupsTab />}
          {tab === "players" && <Players />}
          {tab === "finance" && <Finance />}
          {tab === "economy" && <EconomyTab />}
          {tab === "marketing" && <Marketing />}
          {tab === "balance" && <Balance />}
          {tab === "events" && <Broadcasts />}
          {tab === "rewards" && <RewardsTab />}
          {tab === "drops" && <DropsTab />}
          {tab === "partners" && <PartnersTab />}
          {tab === "monthly" && <MonthlyTab />}
          {tab === "presales" && <PresalesTab />}
          {tab === "push" && <NotificationsTab />}
          {tab === "raffles" && <RafflesTab />}
          {tab === "traffic" && <Traffic />}
          {tab === "music" && <AiTab />}
          {tab === "integrations" && <IntegrationsTab />}
          {tab === "admins" && <Admins />}
        </main>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6"><div className="panel p-6 max-w-md text-center text-sm">{children}</div></div>;
}

function sessionStorageGet(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }

// ================================================================= insights (shared fetch)

interface InsightData {
  accounts: number; accounts_new: number; saves: number; devices: number; dau: number;
  daily: { day: string; players: number; signups: number; gigs: number }[];
  events: Record<string, number>; levels: Record<string, number>; genres: Record<string, number>;
  traffic: Record<string, number>; platforms: Record<string, number>;
}

function useInsights(days: number) {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase!.rpc("admin_insights", { p_days: days });
    setLoading(false);
    if (error) return fail(error);
    setData(data as InsightData);
  }, [days]);
  useEffect(() => { void load(); }, [load]);
  return { data, loading, reload: load };
}

function RangePicker({ days, setDays, onRefresh, loading }: { days: number; setDays: (d: number) => void; onRefresh: () => void; loading: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded border border-line overflow-hidden text-xs">
        {[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 ${days === d ? "bg-white/10 text-fg" : "text-muted-fg"}`}>{d}d</button>
        ))}
      </div>
      <button className="text-xs px-3 py-1.5 rounded border border-line text-muted-fg" onClick={onRefresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
    </div>
  );
}

function Insights() {
  const [days, setDays] = useState(30);
  const { data, loading, reload } = useInsights(days);
  const e = data?.events ?? {};
  const levels = LEVELS.map((l) => ({ label: `${l.level}. ${l.name}`, value: Number(data?.levels?.[l.level] ?? 0) }));
  const genres = Object.entries(data?.genres ?? {}).map(([k, v]) => ({ label: GENRES[k as keyof typeof GENRES]?.name ?? k, value: Number(v) })).sort((a, b) => b.value - a.value);

  return (
    <>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Insights</h1>
          <p className="text-xs text-muted-fg mt-1">Players are counted by device, so guests are included. Accounts are signed-up players.</p>
        </div>
        <RangePicker days={days} setDays={setDays} onRefresh={reload} loading={loading} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <Kpi label="Players today" value={data?.dau ?? "—"} />
        <Kpi label={`Players · ${days}d`} value={data?.devices ?? "—"} />
        <Kpi label="Accounts" value={data?.accounts ?? "—"} sub={data ? `+${data.accounts_new} in ${days}d` : undefined} />
        <Kpi label="Cloud saves" value={data?.saves ?? "—"} />
        <Kpi label={`Gigs · ${days}d`} value={e.gig ?? 0} />
        <Kpi label={`Releases · ${days}d`} value={e.release ?? 0} />
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Section title="Daily players" sub="Devices that opened the game each day.">
          <DayBars label="Daily players" data={(data?.daily ?? []).map((d) => ({ day: d.day, value: d.players }))} />
        </Section>
        <Section title="New accounts" sub="Sign-ups per day.">
          <DayBars label="New accounts" color="var(--gold)" data={(data?.daily ?? []).map((d) => ({ day: d.day, value: d.signups }))} />
        </Section>
        <Section title="Gigs played" sub="Shows booked per day across all players.">
          <DayBars label="Gigs" color="var(--neon-pink)" data={(data?.daily ?? []).map((d) => ({ day: d.day, value: d.gigs }))} />
        </Section>
        <Section title="Where careers are" sub="Cloud saves by current level.">
          <RankBars rows={levels} color="var(--gold)" empty="No cloud saves yet." />
        </Section>
        <Section title="Genres" sub="Cloud saves by genre.">
          <RankBars rows={genres} color="var(--electric)" empty="No cloud saves yet." />
        </Section>
        <Section title="Activity" sub={`Event counts, last ${days} days.`}>
          <RankBars
            rows={["career_created", "gig", "release", "level_up", "daily_claim", "lockout", "sign_in", "premium_purchase"].map((k) => ({ label: k.replace("_", " "), value: Number(e[k] ?? 0) })).filter((r) => r.value > 0)}
            color="var(--success)"
            empty="No activity yet. Events appear as players play."
          />
        </Section>
      </div>
    </>
  );
}

// ================================================================= players

interface PlayerRow { user_id: string; email: string; artist_name: string | null; fame: number; genre: string | null; persona: string | null; level_week: number; cash: number; fans: number; gigs: number; releases: number; purchases: number; updated_at: string; created_at: string }

function Players() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (search: string) => {
    setLoading(true);
    const { data, error } = await supabase!.rpc("admin_players", { p_search: search, p_limit: 200 });
    setLoading(false);
    if (error) return fail(error);
    setRows((data as PlayerRow[]) ?? []);
  }, []);
  useEffect(() => { const t = setTimeout(() => void load(q.trim()), 300); return () => clearTimeout(t); }, [q, load]);

  return (
    <Section title="Players" sub="Signed-in players with a cloud save, ranked by fame. Guests aren't listed until they make an account.">
      <input className={`${input} mb-4 max-w-sm`} placeholder="Search artist or email" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
            <tr className="border-b border-line">
              <th className="py-2 pr-3">Artist</th><th className="pr-3">Email</th><th className="pr-3">Level</th>
              <th className="pr-3 text-right">Fame</th><th className="pr-3 text-right">Fans</th><th className="pr-3 text-right">Cash</th>
              <th className="pr-3 text-right">Gigs</th><th className="pr-3 text-right">Releases</th><th className="pr-3 text-right">Purchases</th><th>Last synced</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b border-line/50">
                <td className="py-2 pr-3 font-semibold">{r.artist_name ?? <span className="text-muted-fg">No career</span>}</td>
                <td className="pr-3 text-muted-fg">{r.email}</td>
                <td className="pr-3">{levelName(r.fame ?? 0).name}</td>
                <td className="pr-3 text-right">{(r.fame ?? 0).toLocaleString()}</td>
                <td className="pr-3 text-right">{r.fans.toLocaleString()}</td>
                <td className="pr-3 text-right">${r.cash.toLocaleString()}</td>
                <td className="pr-3 text-right">{r.gigs}</td>
                <td className="pr-3 text-right">{r.releases}</td>
                <td className="pr-3 text-right">{r.purchases}</td>
                <td className="text-muted-fg whitespace-nowrap">{when(r.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="text-sm text-muted-fg text-center py-8">{q ? "No players match that search." : "No signed-in players yet."}</p>}
        {loading && <p className="text-sm text-muted-fg text-center py-8">Loading…</p>}
      </div>
    </Section>
  );
}

// ================================================================= finance

function Finance() {
  const { data } = useInsights(30);
  const sims = Number(data?.events?.premium_purchase ?? 0);
  return (
    <>
      <Section title="Revenue" sub="Real revenue appears here once RevenueCat is connected and in-app purchases go live.">
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          <Kpi label="Revenue · 30d" value="$0" sub="No real purchases yet" />
          <Kpi label="Simulated purchases · 30d" value={sims} sub="Test taps on the Premium screen" />
          <Kpi label="Paying players" value="—" sub="Needs RevenueCat" />
        </div>
        <div className="rounded border border-dashed border-line p-4 text-sm">
          <div className="font-semibold mb-2">To turn on real revenue</div>
          <ol className="list-decimal pl-5 space-y-1 text-muted-fg">
            <li>The app's Premium screen already uses real App Store / Google Play purchases through RevenueCat.</li>
            <li>Create the products in App Store Connect with IDs <code>co.please.tourstar.remove_timers</code>, <code>.premium_pass</code>, <code>.vip_badge</code> (non-consumable) and <code>.cash_small</code>, <code>.cash_large</code> (consumable). See LAUNCH.md.</li>
            <li>Add the RevenueCat public SDK keys to the app build (<code>VITE_REVENUECAT_IOS_KEY</code>, <code>VITE_REVENUECAT_ANDROID_KEY</code>). A RevenueCat webhook can then feed live revenue into this tab.</li>
          </ol>
        </div>
      </Section>
    </>
  );
}

// ================================================================= marketing (announcements)

interface AnnRow { id: string; title: string; body: string; style: "banner" | "popup"; cta_label: string | null; cta_route: string | null; active: boolean; starts_at: string; ends_at: string | null; created_at: string }

const ROUTES = [
  { v: "", l: "No button" }, { v: "/tour", l: "Tour" }, { v: "/album", l: "Album" }, { v: "/store", l: "Store" },
  { v: "/premium", l: "Premium" }, { v: "/rivals", l: "Rivals" }, { v: "/locker", l: "Locker" }, { v: "/login", l: "Create account" },
];

function Marketing() {
  const [list, setList] = useState<AnnRow[]>([]);
  const blank = { title: "", body: "", style: "banner" as "banner" | "popup", cta_label: "", cta_route: "", days: 7 };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase!.from("announcements").select("*").order("created_at", { ascending: false }).limit(50);
    if (error) return fail(error);
    setList(data as AnnRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    if (!f.title.trim()) return toast({ ok: false, message: "Give the announcement a title." });
    setBusy(true);
    const { error } = await supabase!.from("announcements").insert({
      title: f.title.trim(), body: f.body.trim(), style: f.style,
      cta_label: f.cta_route ? (f.cta_label.trim() || "Open") : null, cta_route: f.cta_route || null,
      ends_at: f.days > 0 ? new Date(Date.now() + f.days * 864e5).toISOString() : null,
      created_by: useCloud.getState().session?.user.id,
    });
    setBusy(false);
    if (error) return fail(error);
    toast({ ok: true, message: "Announcement is live. Players see it within 5 minutes." });
    setF(blank);
    void load();
  };

  const toggle = async (a: AnnRow) => {
    const { error } = await supabase!.from("announcements").update({ active: !a.active }).eq("id", a.id);
    if (error) return fail(error);
    void load();
  };
  const remove = (a: AnnRow) => askConfirm(`Delete "${a.title}"?`, async () => {
    const { error } = await supabase!.from("announcements").delete().eq("id", a.id);
    if (error) return fail(error);
    void load();
  }, { yes: "Delete", danger: true });

  const live = (a: AnnRow) => a.active && (!a.ends_at || new Date(a.ends_at) > new Date());

  return (
    <>
      <Section title="New announcement" sub="Reaches every player the next time the app checks in (on launch and every 5 minutes). Banners sit under the header until dismissed; pop-ups show once.">
        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <label className="block text-xs text-muted-fg">Title<input className={`${input} mt-1`} maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Double payouts this weekend" /></label>
            <label className="block text-xs text-muted-fg">Message<textarea className={`${input} mt-1 h-24`} maxLength={600} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Every gig pays 2x until Sunday night." /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted-fg">Style
                <select className={`${input} mt-1`} value={f.style} onChange={(e) => setF({ ...f, style: e.target.value as "banner" | "popup" })}>
                  <option value="banner">Banner</option><option value="popup">Pop-up</option>
                </select>
              </label>
              <label className="block text-xs text-muted-fg">Runs for
                <select className={`${input} mt-1`} value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })}>
                  <option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={0}>Until turned off</option>
                </select>
              </label>
              <label className="block text-xs text-muted-fg">Button goes to
                <select className={`${input} mt-1`} value={f.cta_route} onChange={(e) => setF({ ...f, cta_route: e.target.value })}>
                  {ROUTES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              </label>
              <label className="block text-xs text-muted-fg">Button text<input className={`${input} mt-1`} maxLength={30} disabled={!f.cta_route} value={f.cta_label} onChange={(e) => setF({ ...f, cta_label: e.target.value })} placeholder="Book a gig" /></label>
            </div>
            <button className="btn btn-pink" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send to all players"}</button>
          </div>
          <div>
            <div className="text-xs text-muted-fg mb-2">Preview</div>
            <div className="rounded-xl p-4 max-w-sm" style={{ background: "var(--gradient-hero)" }}>
              <div className="panel p-3 flex gap-3 items-start" style={{ borderColor: f.style === "banner" ? "var(--electric)" : "var(--gold)" }}>
                <span className="font-pixel text-[8px] mt-1" style={{ color: "var(--electric)" }}>{f.style === "banner" ? "NEWS" : "POP-UP"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{f.title || "Your title"}</div>
                  <div className="text-xs text-muted-fg mt-1 whitespace-pre-line">{f.body || "Your message"}</div>
                  {f.cta_route && <div className="text-xs underline mt-2" style={{ color: "var(--electric)" }}>{f.cta_label || "Open"} →</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>
      <Section title="Sent announcements">
        {list.length === 0 ? <p className="text-sm text-muted-fg">Nothing sent yet.</p> : (
          <ul className="divide-y divide-line">
            {list.map((a) => (
              <li key={a.id} className="py-3 flex items-start gap-3">
                <span className={`text-[10px] px-2 py-0.5 rounded border mt-0.5 ${live(a) ? "text-success border-success" : "text-muted-fg border-line"}`}>{live(a) ? "LIVE" : "OFF"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{a.title} <span className="text-xs text-muted-fg font-normal">· {a.style}</span></div>
                  {a.body && <div className="text-xs text-muted-fg truncate">{a.body}</div>}
                  <div className="text-[11px] text-muted-fg mt-1">Sent {when(a.created_at)}{a.ends_at ? ` · ends ${when(a.ends_at)}` : ""}</div>
                </div>
                <button className="text-xs underline text-muted-fg" onClick={() => toggle(a)}>{a.active ? "Turn off" : "Turn on"}</button>
                <button className="text-xs underline text-danger" onClick={() => remove(a)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

// ================================================================= balance

function Balance() {
  const [live, setLive] = useState<GameConfig>(DEFAULT_CONFIG);
  const [draft, setDraft] = useState<GameConfig>(DEFAULT_CONFIG);
  const [meta, setMeta] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase!.from("game_config").select("data, updated_at").eq("id", 1).maybeSingle();
    if (error) return fail(error);
    const c = sanitizeConfig(data?.data);
    setLive(c); setDraft(c); setMeta(data?.updated_at ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const dirty = useMemo(() => CONFIG_FIELDS.some((f) => draft[f.key] !== live[f.key]), [draft, live]);

  const save = async (next: GameConfig) => {
    setBusy(true);
    const changed = Object.fromEntries(CONFIG_FIELDS.filter((f) => next[f.key] !== DEFAULT_CONFIG[f.key]).map((f) => [f.key, next[f.key]]));
    const { error } = await supabase!.from("game_config").update({ data: changed, updated_by: useCloud.getState().session?.user.id, updated_at: new Date().toISOString() }).eq("id", 1);
    setBusy(false);
    if (error) return fail(error);
    toast({ ok: true, message: "Balance saved. Players pick it up within 5 minutes." });
    void load();
  };

  return (
    <Section
      title="Game balance"
      sub="Tune the economy live, no app update needed. Players get new values on launch and every 5 minutes. Values are clamped to safe ranges."
      right={<span className="text-[11px] text-muted-fg whitespace-nowrap">Last saved {when(meta)}</span>}
    >
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
        {CONFIG_FIELDS.filter((f) => !f.group).map((f) => {
          const v = draft[f.key];
          const changed = v !== DEFAULT_CONFIG[f.key];
          return (
            <div key={f.key}>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={`cfg-${f.key}`} className="text-sm font-semibold">{f.label}</label>
                <span className={`text-sm tabular-nums ${changed ? "text-gold" : "text-muted-fg"}`}>
                  {f.unit === "$" ? `$${v.toLocaleString()}` : f.unit === "s" ? `${v}s` : f.unit === "×" ? `${v}×` : v.toLocaleString()}
                </span>
              </div>
              <input id={`cfg-${f.key}`} type="range" className="w-full mt-2" min={f.min} max={f.max} step={f.step} value={v}
                onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })} />
              <div className="flex justify-between text-[11px] text-muted-fg">
                <span>{f.help}</span>
                {changed && <button className="underline ml-2 shrink-0" onClick={() => setDraft({ ...draft, [f.key]: DEFAULT_CONFIG[f.key] })}>Default</button>}
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="text-sm font-bold mt-8">Level curve</h3>
      <p className="text-[11px] text-muted-fg mb-3">Fame needed for each level. Raising these slows the climb. Players keep the tours and rewards they've already unlocked if a level moves above them.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {CONFIG_FIELDS.filter((f) => f.group === "levels").map((f) => {
          const v = draft[f.key];
          const changed = v !== live[f.key];
          return (
            <label key={f.key} className="block">
              <span className="text-xs font-semibold">{f.label}</span>
              <input type="number" inputMode="numeric" min={f.min} max={f.max} step={f.step} value={v}
                className={`w-full mt-1 px-2 py-1.5 rounded bg-black/40 border text-sm tabular-nums ${changed ? "border-gold text-gold" : "border-line"}`}
                onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) || 0 })} />
              <span className="text-[10px] text-muted-fg">Default {DEFAULT_CONFIG[f.key].toLocaleString()} ★</span>
            </label>
          );
        })}
      </div>

      <PaceTool live={live} draft={sanitizeConfig(draft)} />
      <div className="flex gap-2 mt-6 flex-wrap">
        <button className="btn btn-pink" disabled={!dirty || busy} onClick={() => save(sanitizeConfig(draft))}>{busy ? "Saving…" : "Save & push live"}</button>
        <button className="btn btn-ghost" disabled={!dirty} onClick={() => setDraft(live)}>Discard changes</button>
        <button className="btn btn-ghost" onClick={() => askConfirm("Reset every setting to the defaults and push live?", () => void save(DEFAULT_CONFIG), { yes: "Reset all" })}>Reset all to defaults</button>
      </div>
    </Section>
  );
}

// ================================================================= pace / tuning tool

interface PaceRow { players: number; median: number; p25: number; p75: number; gigs: number | null }

function PaceTool({ live, draft }: { live: GameConfig; draft: GameConfig }) {
  const [types, setTypes] = useState(PLAYER_TYPES);
  const [real, setReal] = useState<Record<string, PaceRow> | null>(null);
  const [realErr, setRealErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase!.rpc("admin_level_pace", { p_days: 90 }).then(({ data, error }) => {
      if (error) setRealErr(error.message.includes("admin_level_pace") ? "Run RUN-IN-SUPABASE-LEVEL-PACE.sql to turn on real-player timing." : error.message);
      else setReal((data ?? {}) as Record<string, PaceRow>);
    });
  }, []);
  const changed = JSON.stringify(live) !== JSON.stringify(draft);
  const runs = useMemo(() => types.map((p) => ({ p, now: simulateClimb(p, live), next: simulateClimb(p, draft) })), [types, live, draft]);
  const lv = levelThresholds(draft);

  return (
    <div className="mt-8">
      <h3 className="text-sm font-bold">Pace preview</h3>
      <p className="text-[11px] text-muted-fg mb-3">
        Estimated days from a new career to each level{changed ? <> under the live settings <b>→</b> your unsaved changes</> : ""}. It's a model (a full energy bar per check-in, spent on the best tour or release),
        so use it to compare settings, and check the "Real players" column once there's data.
      </p>
      <div className="flex flex-wrap gap-3 mb-3">
        {types.map((p, i) => (
          <label key={p.id} className="text-[11px] text-muted-fg flex items-center gap-1">
            {p.label}
            <input type="number" min={1} max={24} value={p.sessions} className="w-12 px-1 py-0.5 rounded bg-black/40 border border-line text-fg text-xs"
              onChange={(e) => setTypes(types.map((t, j) => (j === i ? { ...t, sessions: Math.max(1, Math.min(24, Number(e.target.value) || 1)) } : t)))} />
            check-ins/day
          </label>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-left text-muted-fg">
              <th className="py-1.5 pr-3 font-normal">Level</th>
              {types.map((p) => <th key={p.id} className="py-1.5 pr-3 font-normal">{p.label}</th>)}
              <th className="py-1.5 pr-3 font-normal">Real players (median)</th>
            </tr>
          </thead>
          <tbody>
            {LEVELS.slice(1).map((l) => {
              const r = real?.[String(l.level)];
              return (
                <tr key={l.level} className="border-t border-line">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{l.level}. {l.name}<span className="text-muted-fg"> · {lv[l.level].toLocaleString()} ★</span></td>
                  {runs.map(({ p, now, next }) => (
                    <td key={p.id} className="py-1.5 pr-3 whitespace-nowrap">
                      {changed && now[l.level] !== next[l.level] ? <><span className="text-muted-fg">{fmtDays(now[l.level])}</span> → <b className="text-gold">{fmtDays(next[l.level])}</b></> : fmtDays(next[l.level])}
                    </td>
                  ))}
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {r ? <>{fmtDays(Math.max(1, Math.ceil(r.median)))} <span className="text-muted-fg">({r.players} players{r.gigs != null ? ` · ${r.gigs} gigs` : ""})</span></> : <span className="text-muted-fg">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {realErr && <p className="text-[11px] text-muted-fg mt-2">{realErr}</p>}
      <p className="text-[11px] text-muted-fg mt-2">Real players: level-ups in the last 90 days, timed from when that device started its career. Players who reached a level under older settings are included.</p>
    </div>
  );
}

// ================================================================= events & gifts

interface BcRow { id: string; kind: "event" | "gift"; event_id: string | null; gift: Record<string, number> | null; message: string | null; active: boolean; expires_at: string; created_at: string }

function Broadcasts() {
  const [list, setList] = useState<BcRow[]>([]);
  const [mode, setMode] = useState<"event" | "gift">("event");
  const [eventId, setEventId] = useState(EVENTS[0].id);
  const [gift, setGift] = useState<Record<string, number>>({ cash: 1000, energy: 50 });
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(3);
  const ev = EVENTS.find((e) => e.id === eventId)!;
  const load = useCallback(async () => {
    const { data, error } = await supabase!.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(30);
    if (error) return fail(error);
    setList(data as BcRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = () => {
    const cleanGift = Object.fromEntries(Object.entries(gift).filter(([, v]) => Number(v) !== 0));
    if (mode === "gift" && !Object.keys(cleanGift).length) return toast({ ok: false, message: "Add at least one reward to the gift." });
    const what = mode === "event" ? `the "${ev.title}" event` : "this gift";
    askConfirm(`Send ${what} to every player? It reaches each player once, the next time they open the game in the next ${days} day${days > 1 ? "s" : ""}.`, async () => {
      const { error } = await supabase!.from("broadcasts").insert({
        kind: mode, event_id: mode === "event" ? eventId : null, gift: mode === "gift" ? cleanGift : null,
        message: message.trim() || null, expires_at: new Date(Date.now() + days * 864e5).toISOString(),
        created_by: useCloud.getState().session?.user.id,
      });
      if (error) return fail(error);
      toast({ ok: true, message: "Sent. Players get it within 5 minutes." });
      setMessage("");
      void load();
    }, { yes: "Send to everyone" });
  };

  const stop = async (b: BcRow) => {
    const { error } = await supabase!.from("broadcasts").update({ active: false }).eq("id", b.id);
    if (error) return fail(error);
    void load();
  };

  return (
    <>
      <Section title="Trigger for all players" sub="Fire one of the game's random events, or send a gift of game stats. Each player gets it once.">
        <div className="flex rounded border border-line overflow-hidden text-sm w-fit mb-4">
          <button className={`px-4 py-2 ${mode === "event" ? "bg-white/10" : "text-muted-fg"}`} onClick={() => setMode("event")}>Game event</button>
          <button className={`px-4 py-2 ${mode === "gift" ? "bg-white/10" : "text-muted-fg"}`} onClick={() => setMode("gift")}>Gift</button>
        </div>
        {mode === "event" ? (
          <div className="grid md:grid-cols-2 gap-5">
            <label className="block text-xs text-muted-fg">Event
              <select className={`${input} mt-1`} value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {EVENTS.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.kind}{e.minLevel ? `, level ${e.minLevel}+` : ""})</option>)}
              </select>
            </label>
            <div className="panel p-3 text-sm">
              <div className="font-semibold">{ev.emoji} {ev.title}</div>
              <p className="text-xs text-muted-fg mt-1">{ev.text}</p>
              <ul className="text-xs mt-2 space-y-0.5">{ev.choices.map((c) => <li key={c.label}>• {c.label}</li>)}</ul>
              {ev.choices.some((c) => c.outcomes.some((o) => o.lockout)) && <p className="text-[11px] text-gold mt-2">Some choices can lock players out (jail, rehab, cancelled).</p>}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["cash", "energy", "fame", "fans", "hype", "health", "credibility", "relationships"] as const).map((k) => (
              <label key={k} className="block text-xs text-muted-fg">{STAT_META[k].label}
                <input type="number" className={`${input} mt-1 tabular-nums`} value={gift[k] ?? 0} onChange={(e) => setGift({ ...gift, [k]: Math.round(Number(e.target.value) || 0) })} />
              </label>
            ))}
          </div>
        )}
        <div className="grid md:grid-cols-[1fr_auto] gap-3 mt-4 items-end">
          <label className="block text-xs text-muted-fg">Message players see (optional)
            <input className={`${input} mt-1`} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={mode === "gift" ? "Thanks for playing! Here's a boost." : ""} />
          </label>
          <label className="block text-xs text-muted-fg">Available for
            <select className={`${input} mt-1`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option>
            </select>
          </label>
        </div>
        <button className="btn btn-pink mt-4" onClick={send}>Send to all players</button>
      </Section>
      <Section title="Recent">
        {list.length === 0 ? <p className="text-sm text-muted-fg">Nothing sent yet.</p> : (
          <ul className="divide-y divide-line">
            {list.map((b) => {
              const live = b.active && new Date(b.expires_at) > new Date();
              const label = b.kind === "event" ? `Event: ${EVENTS.find((e) => e.id === b.event_id)?.title ?? b.event_id}` : `Gift: ${Object.entries(b.gift ?? {}).map(([k, v]) => `${v > 0 ? "+" : ""}${v.toLocaleString()} ${k}`).join(", ")}`;
              return (
                <li key={b.id} className="py-3 flex items-center gap-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${live ? "text-success border-success" : "text-muted-fg border-line"}`}>{live ? "LIVE" : "ENDED"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{label}</div>
                    <div className="text-[11px] text-muted-fg">Sent {when(b.created_at)} · until {when(b.expires_at)}{b.message ? ` · "${b.message}"` : ""}</div>
                  </div>
                  {live && <button className="text-xs underline text-danger" onClick={() => stop(b)}>Stop</button>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

// ================================================================= orders


// ================================================================= traffic

function Traffic() {
  const [days, setDays] = useState(30);
  const { data, loading, reload } = useInsights(days);
  const sources = Object.entries(data?.traffic ?? {}).map(([label, value]) => ({ label, value: Number(value) })).sort((a, b) => b.value - a.value);
  const platforms = Object.entries(data?.platforms ?? {}).map(([label, value]) => ({ label: label === "ios" ? "iPhone" : label === "android" ? "Android" : label === "web" ? "Web" : label, value: Number(value) })).sort((a, b) => b.value - a.value);
  return (
    <>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Traffic sources</h1>
          <p className="text-xs text-muted-fg mt-1">New players by where they came from, counted on their first open.</p>
        </div>
        <RangePicker days={days} setDays={setDays} onRefresh={reload} loading={loading} />
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Section title="Sources" sub="App installs count as app_store / play_store; web visits use the link's source tag or the referring site.">
          <RankBars rows={sources} empty="No new players in this range yet." />
        </Section>
        <Section title="Platforms" sub="Players by device type.">
          <RankBars rows={platforms} color="var(--electric)" empty="No players in this range yet." />
        </Section>
      </div>
      <Section title="Tag your links" sub="Add a source to any link you share so it shows up here by name.">
        <code className="block text-xs bg-black/40 rounded p-3 overflow-x-auto">https://tourstarapp.com/?utm_source=tiktok</code>
        <p className="text-xs text-muted-fg mt-2">Use one name per channel: tiktok, instagram, newsletter, matchbox20-fanclub, and so on.</p>
      </Section>
    </>
  );
}

// ================================================================= admins

function Admins() {
  const [rows, setRows] = useState<{ email: string; status: string; created_at: string }[]>([]);
  const [email, setEmail] = useState("");
  const [notify, setNotify] = useState(true);
  const me = useCloud((s) => s.email);
  const load = useCallback(async () => {
    const { data, error } = await supabase!.rpc("admin_list");
    if (error) return fail(error);
    setRows(data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    const { data, error } = await supabase!.rpc("admin_add", { p_email: email.trim() });
    if (error) return fail(error);
    const who = email.trim();
    let emailNote = "";
    if (notify) {
      const r = await supabase!.functions.invoke("admin-notify", { body: { email: who } });
      let err = r.error ? errMsg(r.error) : "";
      if (r.error) { try { err = (await (r.error as { context?: Response }).context?.json())?.error ?? err; } catch { /* keep */ } }
      emailNote = r.error ? ` (The email didn't send: ${err})` : " We emailed them.";
    }
    toast({ ok: true, message: (data === "added" ? `${who} is now an admin.` : `Invited ${who}. They become an admin when they sign in with that email and confirm it.`) + emailNote });
    setEmail("");
    void load();
  };
  const remove = (e: string) => askConfirm(`Remove ${e} as an admin?`, async () => {
    const { error } = await supabase!.rpc("admin_remove", { p_email: e });
    if (error) return fail(error);
    void load();
  }, { yes: "Remove", danger: true });

  return (
    <>
    <WebsiteSwitch />
    <Section title="Admins" sub="Admins can see every player's save and change live game settings. Invites only work for someone who signs in with that exact email and confirms it.">
      <div className="flex gap-2 mb-5 max-w-md">
        <input className={input} type="email" placeholder="name@please.co" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && email && void add()} />
        <button className="btn btn-pink whitespace-nowrap" disabled={!email.includes("@")} onClick={add}>Add admin</button>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-fg -mt-3 mb-5"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Email them that they've been added (with a sign-in link)</label>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.email} className="py-3 flex items-center gap-3">
            <span className={`text-[10px] px-2 py-0.5 rounded border ${r.status === "admin" ? "text-success border-success" : "text-gold border-gold"}`}>{r.status === "admin" ? "ADMIN" : "INVITED"}</span>
            <span className="flex-1 text-sm">{r.email}{r.email === me && <span className="text-muted-fg"> (you)</span>}</span>
            <span className="text-[11px] text-muted-fg">{when(r.created_at)}</span>
            {r.email !== me && <button className="text-xs underline text-danger" onClick={() => remove(r.email)}>Remove</button>}
          </li>
        ))}
      </ul>
    </Section>
    </>
  );
}

// ================================================================= website

function WebsiteSwitch() {
  const { webPublic, loaded } = useSite();
  const set = (on: boolean) => askConfirm(on
    ? "Open the game to everyone at tourstarapp.com/play? Anyone with the link can play."
    : "Hide the game on the website? Visitors see a coming-soon screen; admins can still play.", async () => {
    const { error } = await supabase!.from("app_public_config").upsert({ key: "web_app_public", value: String(on), updated_at: new Date().toISOString() });
    if (error) return fail(error);
    await refreshSite();
    toast({ ok: true, message: on ? "The game is open on the website." : "The game is hidden on the website." });
  }, { yes: on ? "Open it" : "Hide it", danger: on });
  return (
    <Section title="Website" sub="tourstarapp.com shows the splash page and waitlist. The game lives at tourstarapp.com/play. While it's hidden, visitors see a coming-soon screen and only admins can play. The iPhone and Android apps aren't affected.">
      {!loaded ? <p className="text-xs text-muted-fg">Checking…</p> : (
        <div className="flex items-center gap-4">
          <span className={`text-[10px] px-2 py-0.5 rounded border ${webPublic ? "text-success border-success" : "text-gold border-gold"}`}>{webPublic ? "● GAME OPEN" : "○ GAME HIDDEN"}</span>
          <button className={`btn ${webPublic ? "btn-ghost" : "btn-pink"} text-xs`} onClick={() => set(!webPublic)}>{webPublic ? "Hide the game" : "Open the game to everyone"}</button>
        </div>
      )}
    </Section>
  );
}
