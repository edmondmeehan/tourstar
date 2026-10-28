// Admin: AI audio (ElevenLabs). On/off switches, the daily cap, usage and recent clips.
// The key itself lives in Integrations (Supabase Vault); the app only ever sees these switches.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/cloud";
import { clearMoCache, lastVoiceError, moLineUrl, playClip, refreshAiFlags, type ClipHandle } from "../lib/ai";
import { askConfirm, toast } from "../components/ui";
import { Kpi, Section, fail, input, when } from "./kit";

interface Gen { id: string; kind: "song" | "intro" | "mo"; path: string | null; status: "ok" | "failed"; detail: string | null; created_at: string }
const KIND_LABEL: Record<Gen["kind"], string> = { song: "🎧 Song", intro: "🎤 Stadium intro", mo: "🧢 Mo" };

export function AiTab() {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [key, setKey] = useState<{ last4: string; last_test_ok: boolean | null; last_test_message: string | null } | null | undefined>(undefined);
  const [gens, setGens] = useState<Gen[]>([]);
  const [limit, setLimit] = useState("3");
  const [minLevel, setMinLevel] = useState("3");
  const playing = useRef<ClipHandle | null>(null);
  const [nowId, setNowId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [c, s, g] = await Promise.all([
      supabase!.from("app_public_config").select("key, value").in("key", ["ai_music_enabled", "ai_voice_enabled", "ai_music_daily_limit", "ai_music_min_level"]),
      supabase!.rpc("admin_list_secrets"),
      supabase!.from("ai_generations").select("id, kind, path, status, detail, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    ]);
    if (c.error) return fail(c.error);
    const m = Object.fromEntries((c.data ?? []).map((r) => [r.key, r.value as string]));
    setCfg(m);
    setLimit(m.ai_music_daily_limit ?? "3");
    setMinLevel(m.ai_music_min_level ?? "3");
    if (!s.error) setKey((s.data as { name: string; last4: string; last_test_ok: boolean | null; last_test_message: string | null }[]).find((r) => r.name === "elevenlabs_api_key") ?? null);
    if (g.error) fail(g.error); else setGens(g.data as Gen[]);
  }, []);
  useEffect(() => { void load(); return () => playing.current?.stop(); }, [load]);

  const save = async (k: string, v: string) => {
    const { error } = await supabase!.from("app_public_config").upsert({ key: k, value: v, updated_at: new Date().toISOString() });
    if (error) return fail(error);
    setCfg((c) => ({ ...c, [k]: v }));
    void refreshAiFlags();
    toast({ ok: true, message: "Saved. Players pick it up within a few minutes." });
  };

  const url = (p: string | null) => (p ? supabase!.storage.from("ai-audio").getPublicUrl(p).data.publicUrl : null);
  const play = (id: string, u: string | null) => {
    playing.current?.stop();
    if (!u || nowId === id) { setNowId(null); return; }
    setNowId(id);
    playing.current = playClip(u, { onEnd: () => setNowId(null) });
  };
  const previewMo = async () => {
    toast({ ok: true, message: "Getting Mo's line… the first recording takes a few seconds." });
    const u = await moLineUrl(0, true);
    if (!u) return toast({ ok: false, message: `Couldn't get Mo's line: ${lastVoiceError || "unknown error"}` });
    play("mo-preview", u);
  };

  /** Delete recordings (row + audio file). Voice lines re-record (and cost credits) the next time they're needed. */
  const remove = (rows: Gen[], label: string) => askConfirm(label, async () => {
    playing.current?.stop(); setNowId(null);
    const paths = rows.filter((r) => r.status === "ok" && r.path).map((r) => r.path!);
    if (paths.length) {
      const st = await supabase!.storage.from("ai-audio").remove(paths);
      if (st.error) return fail(st.error);
    }
    const { error } = await supabase!.from("ai_generations").delete().in("id", rows.map((r) => r.id));
    if (error) return fail(error);
    if (rows.some((r) => r.kind === "mo")) clearMoCache();
    toast({ ok: true, message: `Deleted ${rows.length} recording${rows.length === 1 ? "" : "s"}.` });
    void load();
  }, { yes: "Delete", danger: true });

  const ok = gens.filter((g) => g.status === "ok");
  const failed = gens.length - ok.length;
  const musicOn = cfg.ai_music_enabled === "true";
  const voiceOn = cfg.ai_voice_enabled === "true";

  return (
    <>
      <Section title="ElevenLabs" sub="The key is stored in Integrations and never reaches the app. Players only see the switches below.">
        {key === undefined ? <p className="text-xs text-muted-fg">Checking…</p>
          : key ? (
            <p className="text-sm">
              <span className={key.last_test_ok === false ? "text-danger" : "text-success"}>● Key saved</span> <span className="text-muted-fg">(ends in {key.last4})</span>
              {key.last_test_message && <span className="block text-xs text-muted-fg mt-1">Last test: {key.last_test_message}</span>}
            </p>
          ) : <p className="text-sm text-gold">○ No key yet. Add it in the <b>Integrations</b> tab under ElevenLabs, then switch features on here.</p>}
      </Section>

      <div className="grid sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="AI songs · 30d" value={ok.filter((g) => g.kind === "song").length} />
        <Kpi label="Stadium intros · 30d" value={ok.filter((g) => g.kind === "intro").length} />
        <Kpi label="Mo lines recorded" value={ok.filter((g) => g.kind === "mo").length} sub="Recorded once, shared by everyone" />
        <Kpi label="Failures · 30d" value={failed} />
      </div>

      <Section title="Features" sub="Each recording uses ElevenLabs credits. Voice lines are cached, so each one is only paid for once.">
        <Toggle on={musicOn} onChange={(v) => save("ai_music_enabled", String(v))} title="AI songs for releases"
          note="Signed-in players can record a real ~30s song (45s for an LP) when they drop a release. Plays in their Locker." />
        <div className="flex items-center gap-3 py-3 pl-14">
          <label className="text-xs text-muted-fg whitespace-nowrap">Songs per player per day</label>
          <input className={`${input} max-w-[90px]`} type="number" min={0} max={50} value={limit} onChange={(e) => setLimit(e.target.value)} />
          <button className="btn btn-ghost text-xs" disabled={limit === (cfg.ai_music_daily_limit ?? "3") || !(Number(limit) >= 0)} onClick={() => save("ai_music_daily_limit", String(Math.floor(Number(limit))))}>Save</button>
        </div>
        <div className="flex items-center gap-3 py-3 pl-14 flex-wrap">
          <label className="text-xs text-muted-fg whitespace-nowrap">Daily free songs unlock at level</label>
          <select className={`${input} max-w-[90px]`} value={minLevel} onChange={(e) => setMinLevel(e.target.value)}>{[1, 2, 3, 4, 5, 6, 7].map((l) => <option key={l} value={l}>LV{l}</option>)}</select>
          <button className="btn btn-ghost text-xs" disabled={minLevel === (cfg.ai_music_min_level ?? "3")} onClick={() => save("ai_music_min_level", minLevel)}>Save</button>
          <span className="text-[11px] text-muted-fg basis-full">Everyone gets one free debut recording. VIP members and players with Studio Session credits can record at any level.</span>
        </div>
        <Toggle on={voiceOn} onChange={(v) => save("ai_voice_enabled", String(v))} title="AI voices"
          note="Mo the manager talks through the tutorial, and a stadium announcer introduces each signed-in player's artist before their shows." />
        {voiceOn && <button className="btn btn-ghost text-xs mt-2 ml-14" onClick={previewMo}>{nowId === "mo-preview" ? "■ Stop" : "▶ Hear Mo's first line"}</button>}
      </Section>

      <Section title="Recent recordings" sub="Last 30 days, newest first. Deleting a voice line means it's recorded again (and paid for again) the next time it's needed. Deleting a song removes it from that player's Locker."
        right={failed > 0 ? <button className="btn btn-ghost text-xs whitespace-nowrap" onClick={() => remove(gens.filter((g) => g.status === "failed"), `Clear ${failed} failed attempt${failed === 1 ? "" : "s"}? These have no audio, so nothing is lost.`)}>Clear failed</button> : undefined}>
        {gens.length === 0 ? <p className="text-xs text-muted-fg">Nothing recorded yet.</p> : (
          <ul className="divide-y divide-line">
            {gens.slice(0, 40).map((g) => (
              <li key={g.id} className="py-2 flex items-center gap-3 text-sm">
                <button className="w-8 h-8 rounded-full border border-pink shrink-0 disabled:opacity-30" disabled={g.status !== "ok" || !g.path} onClick={() => play(g.id, url(g.path))} aria-label="Play">{nowId === g.id ? "■" : "▶"}</button>
                <span className="w-32 shrink-0">{KIND_LABEL[g.kind]}</span>
                <span className={`flex-1 min-w-0 truncate text-xs ${g.status === "failed" ? "text-danger" : "text-muted-fg"}`}>{g.status === "failed" ? `Failed: ${g.detail ?? ""}` : g.detail}</span>
                <span className="text-[11px] text-muted-fg whitespace-nowrap">{when(g.created_at)}</span>
                <button className="text-muted-fg text-xs px-1 hover:text-danger" aria-label="Delete"
                  onClick={() => remove([g], g.status === "failed" ? "Delete this failed attempt?" : `Delete this ${KIND_LABEL[g.kind].replace(/^\S+ /, "").toLowerCase()} recording? This can't be undone.`)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <RadioReports />
    </>
  );
}

function Toggle({ on, onChange, title, note }: { on: boolean; onChange: (v: boolean) => void; title: string; note: string }) {
  return (
    <div className="flex items-start gap-4 py-3">
      <button role="switch" aria-checked={on} onClick={() => onChange(!on)}
        className={`w-10 h-6 rounded-full shrink-0 relative transition ${on ? "bg-[var(--neon-pink)]" : "bg-black/50 border border-line"}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-5" : "left-1"}`} />
      </button>
      <div><div className="text-sm font-semibold">{title}</div><div className="text-xs text-muted-fg mt-0.5">{note}</div></div>
    </div>
  );
}

interface Reported { id: string; path: string; hidden: boolean; title: string; artist: string; email: string | null; reports: number; reasons: string[] | null; last: string | null }

/** Songs players reported on TourStar Radio (3 reports take a song off the air until reviewed). */
function RadioReports() {
  const [rows, setRows] = useState<Reported[] | null>(null);
  const playing = useRef<ClipHandle | null>(null);
  const [nowId, setNowId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase!.rpc("admin_radio_reports");
    if (error) { setRows([]); if (!error.message.includes("admin_radio_reports")) fail(error); return; }
    setRows(data as Reported[]);
  }, []);
  useEffect(() => { void load(); return () => playing.current?.stop(); }, [load]);

  const set = async (r: Reported, hidden: boolean, clear: boolean) => {
    const { error } = await supabase!.rpc("admin_set_song_hidden", { p_gen: r.id, p_hidden: hidden, p_clear_reports: clear });
    if (error) return fail(error);
    toast({ ok: true, message: hidden ? `"${r.title}" is off the radio and out of TourStar Monthly.` : `"${r.title}" is back on the radio.` });
    void load();
  };
  const listen = (r: Reported) => {
    playing.current?.stop();
    if (nowId === r.id) { setNowId(null); return; }
    setNowId(r.id);
    playing.current = playClip(supabase!.storage.from("ai-audio").getPublicUrl(r.path).data.publicUrl, { onEnd: () => setNowId(null) });
  };

  return (
    <Section title="Radio reports" sub="Songs players reported on TourStar Radio. Three reports take a song off the air automatically. Hide keeps it off the radio and out of the monthly release; Restore puts it back and clears the reports.">
      {!rows ? <p className="text-sm text-muted-fg">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-fg text-center py-4">No reports.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px] [&_th]:px-2 [&_td]:px-2">
            <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
              <tr className="border-b border-line"><th className="py-2">Song</th><th>Player</th><th className="text-right">Reports</th><th>Reasons</th><th>Status</th><th /></tr>
            </thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b border-line/50">
                <td className="py-2">{r.title}</td>
                <td className="text-xs">{r.artist}<span className="text-muted-fg">{r.email ? ` · ${r.email}` : ""}</span></td>
                <td className="text-right tabular-nums">{r.reports}</td>
                <td className="text-xs text-muted-fg">{(r.reasons ?? []).join(", ") || "—"}</td>
                <td className="text-xs">{r.hidden ? "Hidden" : r.reports >= 3 ? "Off air (reports)" : "On air"}</td>
                <td className="text-right whitespace-nowrap space-x-3">
                  <button className="text-xs underline" onClick={() => listen(r)}>{nowId === r.id ? "■ Stop" : "▶ Listen"}</button>
                  {r.hidden || r.reports >= 3
                    ? <button className="text-xs underline" onClick={() => void set(r, false, true)}>Restore</button>
                    : null}
                  {!r.hidden && <button className="text-xs underline text-danger" onClick={() => askConfirm(`Hide "${r.title}" from the radio and the monthly release?`, () => void set(r, true, false), { yes: "Hide", danger: true })}>Hide</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
