// TourStar Radio: listen to real AI songs from every player, one station per genre.
// Playback lives in lib/radio, so it keeps going across pages (mini player in the layout).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Modal, PageTitle, toast } from "../components/ui";
import { GENRES } from "../game/data";
import { useGame } from "../game/store";
import { closeRadio, dropSong, patchSong, playAt, reportSong, stopRadio, toggleLike, tune, useRadio, type RadioSong } from "../lib/radio";
import { sfx } from "../lib/fx";

const STATIONS = [
  { id: "hot", name: "Hot", emoji: "🔥" },
  { id: "new", name: "New", emoji: "✨" },
  { id: "all", name: "Shuffle", emoji: "🔀" },
  ...Object.entries(GENRES).map(([id, g]) => ({ id, name: g.name, emoji: g.emoji })),
];
const REASONS = ["Offensive title or name", "Uses a real artist's name", "Sounds broken", "Something else"];

export default function Radio() {
  const genre = useGame((s) => s.career?.genre);
  const { station, queue, idx, playing } = useRadio();
  const [reporting, setReporting] = useState<RadioSong | null>(null);
  const song = queue?.[idx] ?? null;

  const pick = (id: string) => { void tune(id).catch(() => toast({ ok: false, message: "Couldn't tune in. Check your connection." })); };
  useEffect(() => { if (!useRadio.getState().station) pick(genre ?? "hot"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const like = async (s: RadioSong) => {
    const n = await toggleLike(s.id);
    if (n === null) return toast({ ok: false, message: "Couldn't save that. Try again." });
    if (!s.liked) sfx("coin");
    patchSong(s.id, { liked: !s.liked, likes: n });
  };

  const report = async (reason: string) => {
    if (!reporting) return;
    const ok = await reportSong(reporting.id, reason);
    dropSong(reporting.id);
    setReporting(null);
    toast({ ok, message: ok ? "Thanks. We'll review it, and you won't hear it again." : "Couldn't send the report. Try again." });
  };

  const st = STATIONS.find((s) => s.id === station) ?? STATIONS[0];

  return (
    <div>
      <PageTitle title="TOURSTAR RADIO" sub="Real AI songs recorded by players everywhere. Keeps playing while you tour. Like your favorites: the most-liked songs can make the TourStar Monthly." />
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-3">
        {STATIONS.map((s) => (
          <button key={s.id} onClick={() => pick(s.id)} className={`shrink-0 px-3 py-2 rounded-full border text-xs ${station === s.id ? "border-pink text-pink bg-black/30" : "border-line text-muted-fg"}`}>{s.emoji} {s.name}</button>
        ))}
      </div>

      <Card glow="pink" className="mb-4">
        <div className="flex items-center justify-between">
          <div className="font-pixel text-[8px]" style={{ color: "var(--gold)" }}>📻 {st.name.toUpperCase()} FM</div>
          {station && <button className="text-[11px] underline text-muted-fg" onClick={closeRadio}>Turn off radio</button>}
        </div>
        {!queue ? <p className="text-sm text-muted-fg py-6 text-center">{station ? "Tuning in…" : "Pick a station."}</p>
          : !queue.length ? (
            <p className="text-sm text-muted-fg py-6 text-center">No songs on this station yet. <Link to="/album" className="underline">Record one</Link> and be the first.</p>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-3">
                <div className={`text-4xl ${playing ? "animate-pulse" : ""}`}>{GENRES[song!.genre as keyof typeof GENRES]?.emoji ?? "🎵"}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{song!.title}</div>
                  <div className="text-xs text-muted-fg truncate">{song!.artist} · {GENRES[song!.genre as keyof typeof GENRES]?.name ?? song!.genre}</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-4">
                <button className="btn btn-ghost" aria-label="Previous" onClick={() => playAt(idx - 1)}>◀◀</button>
                <button className="btn btn-pink col-span-2" onClick={() => (playing ? stopRadio() : playAt(idx))}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
                <button className="btn btn-ghost" aria-label="Next" onClick={() => playAt(idx + 1)}>▶▶</button>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs">
                <button className={`px-3 py-1.5 rounded-full border ${song!.liked ? "border-pink text-pink" : "border-line text-muted-fg"}`} onClick={() => void like(song!)}>{song!.liked ? "❤️" : "🤍"} {song!.likes.toLocaleString()}</button>
                <button className="underline text-muted-fg" onClick={() => setReporting(song)}>Report</button>
              </div>
            </>
          )}
      </Card>

      {queue && queue.length > 1 && (
        <>
          <h2 className="font-pixel text-[10px] mb-2 text-muted-fg">UP NEXT</h2>
          <ol className="space-y-1.5 mb-4">
            {queue.map((s, i) => (
              <li key={s.id}>
                <button className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded border text-sm ${i === idx ? "border-pink" : "border-line"}`} onClick={() => playAt(i)}>
                  <span className="w-5 text-right text-xs text-muted-fg">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate">{s.title} <span className="text-muted-fg text-xs">· {s.artist}</span></span>
                  <span className="text-[11px] text-muted-fg">{s.liked ? "❤️" : "🤍"} {s.likes}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="text-[11px] text-muted-fg text-center">Songs are made in TourStar's AI studio and belong to TourStar, LLC. See something wrong? Tap Report.</p>

      <Modal open={!!reporting} onClose={() => setReporting(null)}>
        <h3 className="font-pixel text-xs mb-3" style={{ color: "var(--gold)" }}>REPORT SONG</h3>
        <p className="text-sm mb-4">"{reporting?.title}" by {reporting?.artist}</p>
        <div className="grid gap-2">{REASONS.map((r) => <button key={r} className="btn btn-ghost text-xs" onClick={() => void report(r)}>{r}</button>)}</div>
        <button className="text-xs underline text-muted-fg mt-4 block mx-auto" onClick={() => setReporting(null)}>Cancel</button>
      </Modal>
    </div>
  );
}
