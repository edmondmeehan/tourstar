// Admin → Monthly release: gather the month's AI-studio songs, pick and order the tracklist,
// download everything DistroKid needs (audio, tracklist CSV, 3000×3000 cover), then paste the
// streaming links back here and go live so players can find it in the game.
import { useCallback, useEffect, useMemo, useState } from "react";
import { zipSync } from "fflate";
import { supabase } from "../lib/cloud";
import { askConfirm, toast } from "../components/ui";
import { GENRES } from "../game/data";
import { LINK_KEYS, monthLabel, type LinkKey } from "../lib/monthly";
import { Kpi, Section, fail, input } from "./kit";

interface Song { id: string; path: string; created_at: string; genre: string; kind: string; title: string; artist: string; email: string | null; likes?: number; reports?: number; picked?: boolean }
interface Track { gen_id: string; title: string; artist: string; genre: string; path: string }
interface ReleaseRow {
  id?: string; month: string; title: string; status: "draft" | "submitted" | "live"; cover_url: string | null;
  links: Partial<Record<LinkKey, string>>; tracks: Track[]; notes: string; released_on: string | null;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);
const firstOf = (ym: string) => `${ym}-01`;
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
const pad = (n: number) => String(n).padStart(2, "0");
const audioUrl = (path: string) => supabase!.storage.from("ai-audio").getPublicUrl(path).data.publicUrl;
const genreName = (g: string) => GENRES[g as keyof typeof GENRES]?.name ?? g;
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** 3000×3000 JPEG cover in the TourStar look (DistroKid's minimum size). */
async function makeCover(title: string, month: string, count: number): Promise<Blob> {
  await document.fonts.load('120px "Press Start 2P"').catch(() => undefined);
  const S = 3000;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, "#0b0820"); bg.addColorStop(0.55, "#2a0f45"); bg.addColorStop(1, "#05040f");
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  // stage beams
  for (let i = 0; i < 7; i++) {
    g.fillStyle = i % 2 ? "rgba(26,163,255,0.12)" : "rgba(255,66,216,0.12)";
    const x = 300 + i * 400;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 520, S); g.lineTo(x + 520, S); g.closePath(); g.fill();
  }
  // stars
  let seed = [...month].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; const r = 4 + rnd() * 10; g.fillRect(rnd() * S, rnd() * S * 0.6, r, r); }
  // record
  g.fillStyle = "#05030c"; g.beginPath(); g.arc(S / 2, S * 0.6, 820, 0, Math.PI * 2); g.fill();
  for (let r = 300; r < 800; r += 36) { g.strokeStyle = "rgba(255,255,255,0.06)"; g.lineWidth = 6; g.beginPath(); g.arc(S / 2, S * 0.6, r, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = "#f2c230"; g.beginPath(); g.arc(S / 2, S * 0.6, 260, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#05030c"; g.beginPath(); g.arc(S / 2, S * 0.6, 40, 0, Math.PI * 2); g.fill();
  g.textAlign = "center";
  g.font = '260px "Press Start 2P", monospace';
  g.fillStyle = "#ff42d8"; g.shadowColor = "#ff42d8"; g.shadowBlur = 60;
  g.fillText("TOURSTAR", S / 2, 520);
  g.shadowBlur = 0;
  g.font = '110px "Press Start 2P", monospace';
  g.fillStyle = "#ffffff";
  g.fillText("MONTHLY", S / 2, 720);
  g.font = '120px "Press Start 2P", monospace';
  g.fillStyle = "#f2c230";
  g.fillText(monthLabel(month).toUpperCase(), S / 2, 920);
  g.font = '80px "Press Start 2P", monospace';
  g.fillStyle = "#1aa3ff";
  g.fillText(`${count} TRACKS`, S / 2, S - 180);
  void title;
  return new Promise((res) => cv.toBlob((b) => res(b!), "image/jpeg", 0.92));
}

export function MonthlyTab() {
  const [ym, setYm] = useState(thisMonth());
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [rel, setRel] = useState<ReleaseRow | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [curator, setCurator] = useState("");
  useEffect(() => {
    void supabase!.from("app_public_config").select("value").eq("key", "curator_name").maybeSingle().then(({ data }) => setCurator((data?.value as string) ?? ""));
  }, []);
  const saveCurator = async () => {
    const { error } = await supabase!.from("app_public_config").upsert({ key: "curator_name", value: curator.trim().slice(0, 40), updated_at: new Date().toISOString() });
    if (error) return fail(error);
    toast({ ok: true, message: curator.trim() ? `Players now see "${curator.trim()} Picks" on the radio.` : "Curator name cleared. The station shows as Curator's Picks." });
  };
  const setPick = async (s: Song) => {
    const on = !s.picked;
    const { error } = await supabase!.rpc("admin_set_pick", { p_gen: s.id, p_on: on, p_note: "" });
    if (error) return fail(error.message.includes("admin_set_pick") ? { message: "Run the curator picks SQL in Supabase first." } : error);
    setSongs((list) => list?.map((x) => (x.id === s.id ? { ...x, picked: on } : x)) ?? null);
  };

  const load = useCallback(async () => {
    setSongs(null);
    const [s, r] = await Promise.all([
      supabase!.rpc("admin_month_songs", { p_month: firstOf(ym) }),
      supabase!.from("monthly_releases").select("*").eq("month", firstOf(ym)).maybeSingle(),
    ]);
    if (s.error) return fail(s.error.message.includes("admin_month_songs") ? { message: "Run RUN-IN-SUPABASE-MONTHLY.sql in Supabase to turn on monthly releases." } : s.error);
    const list = (s.data ?? []) as Song[];
    setSongs(list);
    const row = r.data as ReleaseRow | null;
    if (row) {
      setRel(row);
      setPicked(row.tracks.map((t) => t.gen_id).filter((id) => list.some((x) => x.id === id)));
    } else {
      setRel({ month: firstOf(ym), title: `TourStar Monthly: ${monthLabel(firstOf(ym))}`, status: "draft", cover_url: null, links: {}, tracks: [], notes: "", released_on: null });
      setPicked(list.map((x) => x.id));
    }
  }, [ym]);
  useEffect(() => { void load(); }, [load]);

  const tracks: Track[] = useMemo(() => picked.map((id) => songs?.find((s) => s.id === id)).filter((s): s is Song => !!s)
    .map((s) => ({ gen_id: s.id, title: s.title, artist: s.artist, genre: s.genre, path: s.path })), [picked, songs]);

  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    tracks.forEach((t) => seen.set(t.title.toLowerCase(), (seen.get(t.title.toLowerCase()) ?? 0) + 1));
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [tracks]);

  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const move = (id: string, d: -1 | 1) => {
    const i = picked.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= picked.length) return;
    const next = [...picked]; [next[i], next[j]] = [next[j], next[i]]; setPicked(next);
  };

  const save = async (patch: Partial<ReleaseRow> = {}) => {
    if (!rel) return;
    const next = { ...rel, ...patch };
    for (const [k, v] of Object.entries(next.links)) if (v && !v.startsWith("https://")) return toast({ ok: false, message: `The ${LINK_KEYS.find((l) => l.key === k)?.label} link must start with https://` });
    if (next.cover_url && !next.cover_url.startsWith("https://")) return toast({ ok: false, message: "The cover link must start with https://" });
    if (next.status === "live" && !Object.values(next.links).some(Boolean)) return toast({ ok: false, message: "Paste at least one streaming link before going live." });
    if (!tracks.length) return toast({ ok: false, message: "Pick at least one song." });
    const row = {
      month: next.month, title: next.title.trim() || `TourStar Monthly: ${monthLabel(next.month)}`, status: next.status, cover_url: next.cover_url || null,
      links: Object.fromEntries(Object.entries(next.links).filter(([, v]) => v)), tracks, notes: next.notes, released_on: next.released_on || null,
      updated_at: new Date().toISOString(),
    };
    setBusy("save");
    const { data, error } = await supabase!.from("monthly_releases").upsert(row, { onConflict: "month" }).select("*").single();
    setBusy(null);
    if (error) return fail(error);
    setRel(data as ReleaseRow);
    toast({ ok: true, message: row.status === "live" ? "Live. Players see it under TourStar Monthly, and their own songs are highlighted." : "Saved." });
  };

  const csv = () => {
    const head = ["Track #", "Title", "Primary artist", "Player credit (artist name in TourStar)", "Genre", "Songwriter / composer", "Copyright owner", "AI generated", "Explicit", "Audio file"];
    const lines = tracks.map((t, i) => [i + 1, t.title, "TourStar", t.artist, genreName(t.genre), "TourStar, LLC", "TourStar, LLC", "Yes", "No", `${pad(i + 1)} - ${safe(t.title)}.mp3`]);
    return [head, ...lines].map((l) => l.map(csvCell).join(",")).join("\n");
  };

  const downloadZip = async () => {
    if (!tracks.length) return toast({ ok: false, message: "Pick at least one song." });
    setBusy("zip");
    try {
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < tracks.length; i++) {
        setProgress(`Downloading ${i + 1} of ${tracks.length}…`);
        const r = await fetch(audioUrl(tracks[i].path));
        if (!r.ok) throw new Error(`Couldn't download "${tracks[i].title}" (${r.status}). Untick it and try again.`);
        files[`${pad(i + 1)} - ${safe(tracks[i].title)}.mp3`] = new Uint8Array(await r.arrayBuffer());
      }
      setProgress("Making the cover…");
      files["cover-3000.jpg"] = new Uint8Array(await (await makeCover(rel?.title ?? "", firstOf(ym), tracks.length)).arrayBuffer());
      files["tracklist.csv"] = new TextEncoder().encode(csv());
      files["README.txt"] = new TextEncoder().encode(readme(rel?.title ?? "", tracks.length));
      setProgress("Zipping…");
      const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: k.endsWith(".mp3") || k.endsWith(".jpg") ? 0 : 6 }]])));
      download(new Blob([zip], { type: "application/zip" }), `tourstar-monthly-${ym}.zip`);
      toast({ ok: true, message: `Downloaded ${tracks.length} tracks, the cover and the tracklist.` });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null); setProgress("");
    }
  };

  const readme = (title: string, n: number) => [
    title, `${n} tracks`, "",
    "Uploading to DistroKid:",
    "1. New upload → Album. Album title as above. Primary artist: TourStar (the same on every track).",
    "2. Cover: cover-3000.jpg.",
    "3. Add the tracks in order (the numbers in the file names). Titles are in tracklist.csv.",
    "4. Songwriter: TourStar, LLC. Tick that the tracks were made with AI.",
    "5. Don't add player names as featured artists; that creates new artist profiles under their names.",
    "6. After it's live, paste the store links and the HyperFollow link into Admin → Artists & partners → Monthly release & picks and set the status to Live.",
    "",
    "Audio is the AI studio's MP3. DistroKid prefers WAV; MP3 is accepted.",
  ].join("\n");

  const coverOnly = async () => { setBusy("cover"); download(await makeCover(rel?.title ?? "", firstOf(ym), tracks.length), `tourstar-monthly-${ym}-cover.jpg`); setBusy(null); };

  return (
    <>
      <Section title="Curator's Picks" sub="Star songs below to put them on the Picks radio station. The name shows to players as '[name] Picks' on the radio, Drum School and Crate Digging. Leave it blank until the curator's written agreement covers using their name.">
        <div className="flex gap-2 items-center">
          <input className={input} placeholder="Curator name (e.g. Questlove)" value={curator} maxLength={40} onChange={(e) => setCurator(e.target.value)} />
          <button className="btn btn-pink text-xs shrink-0" onClick={() => void saveCurator()}>Save</button>
        </div>
      </Section>
      <Section title="Monthly release" sub="Every song recorded in the AI studio this month. Pick and order the tracklist, download the bundle for DistroKid, then paste the streaming links back here and go live. Only AI-studio recordings have audio files; the in-game synth songs aren't included."
        right={<input type="month" className={`${input} !w-auto`} value={ym} max={thisMonth()} onChange={(e) => e.target.value && setYm(e.target.value)} />}>
        <div className="grid sm:grid-cols-4 gap-3 mb-4">
          <Kpi label="Songs recorded" value={songs?.length ?? "—"} />
          <Kpi label="On the tracklist" value={tracks.length} />
          <Kpi label="Artists" value={new Set(tracks.map((t) => t.artist)).size} />
          <Kpi label="Status" value={(rel?.status ?? "draft").toUpperCase()} />
        </div>
        <div className="panel p-3 mb-4 text-xs leading-relaxed" style={{ borderColor: "var(--gold)" }}>
          <b style={{ color: "var(--gold)" }}>Before the first upload:</b> ElevenLabs' music terms allow streaming releases on Creator, Pro, Scale and Business plans, but exclude commercial video games and apps that offer music to end users unless ElevenLabs agrees in writing. Get that approval for TourStar first. DistroKid also needs the AI box ticked and can reject large batches of similar AI tracks, so a curated 10–20 track album is safer than every song.
        </div>
        {!songs ? <p className="text-sm text-muted-fg">Loading…</p> : songs.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">No AI songs were recorded in {monthLabel(firstOf(ym))}.</p> : (
          <>
            <div className="flex flex-wrap gap-3 mb-2 text-xs">
              <button className="underline" onClick={() => setPicked(songs.map((s) => s.id))}>Select all</button>
              <button className="underline" onClick={() => setPicked([])}>Clear</button>
              <button className="underline" onClick={() => setPicked([...songs].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 15).map((s) => s.id))}>Top 15 by radio likes</button>
              <button className="underline" onClick={() => setPicked([...songs.filter((s) => s.picked), ...[...songs].filter((s) => !s.picked).sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))].slice(0, 15).map((s) => s.id))}>Curator's picks first</button>
              {dupes.size > 0 && <span style={{ color: "var(--gold)" }}>⚠ {dupes.size} duplicate title{dupes.size > 1 ? "s" : ""}: stores may reject repeats on one album.</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px] [&_th]:px-2 [&_td]:px-2">
                <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
                  <tr className="border-b border-line"><th className="py-2 w-8" /><th className="w-10">#</th><th>Title</th><th>Player artist</th><th>Genre</th><th className="text-right">❤️</th><th title="Curator's pick">⭐</th><th>Recorded</th><th>Listen</th><th /></tr>
                </thead>
                <tbody>
                  {[...tracks.map((t) => songs.find((s) => s.id === t.gen_id)!), ...songs.filter((s) => !picked.includes(s.id))].map((s) => {
                    const on = picked.includes(s.id);
                    const n = picked.indexOf(s.id) + 1;
                    return (
                      <tr key={s.id} className={`border-b border-line/50 ${on ? "" : "opacity-50"}`}>
                        <td className="py-1.5"><input type="checkbox" checked={on} onChange={() => toggle(s.id)} /></td>
                        <td className="tabular-nums text-muted-fg">{on ? pad(n) : ""}</td>
                        <td className={dupes.has(s.title.toLowerCase()) && on ? "text-gold" : ""}>{s.title}</td>
                        <td className="text-xs">{s.artist}<span className="text-muted-fg">{s.email ? ` · ${s.email}` : ""}</span></td>
                        <td className="text-xs">{genreName(s.genre)}</td>
                        <td className="text-xs text-right tabular-nums">{s.likes ?? 0}{s.reports ? <span className="text-danger" title="Radio reports"> ⚑{s.reports}</span> : null}</td>
                        <td><button className={`text-base ${s.picked ? "" : "opacity-30 grayscale"}`} title={s.picked ? "Remove from Picks" : "Add to Picks"} onClick={() => void setPick(s)}>⭐</button></td>
                        <td className="text-xs text-muted-fg whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</td>
                        <td><audio controls preload="none" src={audioUrl(s.path)} className="h-8 w-48" /></td>
                        <td className="whitespace-nowrap text-xs space-x-2">{on && <><button className="underline" onClick={() => move(s.id, -1)}>↑</button><button className="underline" onClick={() => move(s.id, 1)}>↓</button></>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2 mt-4 items-center">
              <button className="btn btn-pink" disabled={!!busy || !tracks.length} onClick={() => void downloadZip()}>{busy === "zip" ? progress || "…" : `Download for DistroKid (${tracks.length})`}</button>
              <button className="btn btn-ghost text-xs" disabled={!tracks.length} onClick={() => download(new Blob([csv()], { type: "text/csv" }), `tourstar-monthly-${ym}-tracklist.csv`)}>Tracklist CSV</button>
              <button className="btn btn-ghost text-xs" disabled={!!busy} onClick={() => void coverOnly()}>{busy === "cover" ? "…" : "Cover art (3000×3000)"}</button>
            </div>
            <p className="text-[11px] text-muted-fg mt-2">The zip has numbered MP3s, cover-3000.jpg, tracklist.csv and upload steps. Primary artist is "TourStar" on every track; player names are in the CSV for your records and show in the game, not as streaming artists.</p>
          </>
        )}
      </Section>

      {rel && songs && songs.length > 0 && (
        <Section title="Release details & links" sub="After DistroKid delivers the album, paste the links here (the HyperFollow link covers every service) and set the status to Live. Players then see it under TourStar Monthly, with their own songs highlighted.">
          <div className="grid md:grid-cols-3 gap-3">
            <label className="block text-xs text-muted-fg md:col-span-2">Album title<input className={`${input} mt-1`} maxLength={120} value={rel.title} onChange={(e) => setRel({ ...rel, title: e.target.value })} /></label>
            <label className="block text-xs text-muted-fg">Status<select className={`${input} mt-1`} value={rel.status} onChange={(e) => setRel({ ...rel, status: e.target.value as ReleaseRow["status"] })}>
              <option value="draft">Draft</option><option value="submitted">Submitted to DistroKid</option><option value="live">Live (players can see it)</option></select></label>
            <label className="block text-xs text-muted-fg">Release date<input type="date" className={`${input} mt-1`} value={rel.released_on ?? ""} onChange={(e) => setRel({ ...rel, released_on: e.target.value || null })} /></label>
            <label className="block text-xs text-muted-fg md:col-span-2">Cover image link for the game (https, optional)<input className={`${input} mt-1`} value={rel.cover_url ?? ""} onChange={(e) => setRel({ ...rel, cover_url: e.target.value || null })} placeholder="https://… (e.g. the Spotify album art)" /></label>
            {LINK_KEYS.map((l) => (
              <label key={l.key} className={`block text-xs text-muted-fg ${l.key === "hyperfollow" ? "md:col-span-3" : ""}`}>{l.key === "hyperfollow" ? "DistroKid HyperFollow (all services)" : l.label}
                <input className={`${input} mt-1`} value={rel.links[l.key] ?? ""} onChange={(e) => setRel({ ...rel, links: { ...rel.links, [l.key]: e.target.value.trim() } })} placeholder="https://" /></label>
            ))}
            <label className="block text-xs text-muted-fg md:col-span-3">Notes (UPC, DistroKid release ID, anything rejected)<textarea className={`${input} mt-1 h-16`} maxLength={2000} value={rel.notes} onChange={(e) => setRel({ ...rel, notes: e.target.value })} /></label>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <button className="btn btn-pink" disabled={!!busy} onClick={() => rel.status === "live" ? askConfirm(`Make "${rel.title}" visible to all players?`, () => void save(), { yes: "Go live" }) : void save()}>{busy === "save" ? "Saving…" : "Save"}</button>
            {rel.id && rel.status === "live" && <button className="btn btn-ghost text-xs" onClick={() => askConfirm("Hide this release from players?", () => void save({ status: "submitted" }), { yes: "Hide" })}>Hide from players</button>}
          </div>
        </Section>
      )}
    </>
  );
}
