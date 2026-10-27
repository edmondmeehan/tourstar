// Admin: AI audio (ElevenLabs). On/off switches, the daily cap, usage and recent clips.
// The key itself lives in Integrations (Supabase Vault); the app only ever sees these switches.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/cloud";
import { moLineUrl, playClip, refreshAiFlags, type ClipHandle } from "../lib/ai";
import { toast } from "../components/ui";
import { Kpi, Section, fail, input, when } from "./kit";

interface Gen { id: string; kind: "song" | "intro" | "mo"; path: string | null; status: "ok" | "failed"; detail: string | null; created_at: string }
const KIND_LABEL: Record<Gen["kind"], string> = { song: "🎧 Song", intro: "🎤 Stadium intro", mo: "🧢 Mo" };

export function AiTab() {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [key, setKey] = useState<{ last4: string; last_test_ok: boolean | null; last_test_message: string | null } | null | undefined>(undefined);
  const [gens, setGens] = useState<Gen[]>([]);
  const [limit, setLimit] = useState("3");
  const playing = useRef<ClipHandle | null>(null);
  const [nowId, setNowId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [c, s, g] = await Promise.all([
      supabase!.from("app_public_config").select("key, value").in("key", ["ai_music_enabled", "ai_voice_enabled", "ai_music_daily_limit"]),
      supabase!.rpc("admin_list_secrets"),
      supabase!.from("ai_generations").select("id, kind, path, status, detail, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    ]);
    if (c.error) return fail(c.error);
    const m = Object.fromEntries((c.data ?? []).map((r) => [r.key, r.value as string]));
    setCfg(m);
    setLimit(m.ai_music_daily_limit ?? "3");
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
    const u = await moLineUrl(0);
    if (!u) return toast({ ok: false, message: "Couldn't get Mo's line. Check that voices are on and the key works." });
    play("mo-preview", u);
  };

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
        <Toggle on={voiceOn} onChange={(v) => save("ai_voice_enabled", String(v))} title="AI voices"
          note="Mo the manager talks through the tutorial, and a stadium announcer introduces each signed-in player's artist before their shows." />
        {voiceOn && <button className="btn btn-ghost text-xs mt-2 ml-14" onClick={previewMo}>{nowId === "mo-preview" ? "■ Stop" : "▶ Hear Mo's first line"}</button>}
      </Section>

      <Section title="Recent recordings" sub="Last 30 days, newest first.">
        {gens.length === 0 ? <p className="text-xs text-muted-fg">Nothing recorded yet.</p> : (
          <ul className="divide-y divide-line">
            {gens.slice(0, 40).map((g) => (
              <li key={g.id} className="py-2 flex items-center gap-3 text-sm">
                <button className="w-8 h-8 rounded-full border border-pink shrink-0 disabled:opacity-30" disabled={g.status !== "ok" || !g.path} onClick={() => play(g.id, url(g.path))} aria-label="Play">{nowId === g.id ? "■" : "▶"}</button>
                <span className="w-32 shrink-0">{KIND_LABEL[g.kind]}</span>
                <span className={`flex-1 min-w-0 truncate text-xs ${g.status === "failed" ? "text-danger" : "text-muted-fg"}`}>{g.status === "failed" ? `Failed: ${g.detail ?? ""}` : g.detail}</span>
                <span className="text-[11px] text-muted-fg whitespace-nowrap">{when(g.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
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
