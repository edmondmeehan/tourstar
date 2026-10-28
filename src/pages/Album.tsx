import { useState } from "react";
import { Link } from "react-router-dom";
import { RELEASES } from "../game/data";
import { fmtMoney, levelFor } from "../game/engine";
import { useGame } from "../game/store";
import type { ReleaseKind } from "../game/types";
import { Card, Modal, PageTitle, Tag, toast } from "../components/ui";
import { songTitle } from "../lib/chiptune";
import { aiSongAccess, aiSongsAvailable, recordAiSong, useAiFlags } from "../lib/ai";
import { useCloud } from "../lib/cloud";
import { CRATE_MAX, DIG_ENERGY, RARITY, sampleBoost } from "../game/crate";

export default function Album() {
  const c = useGame((s) => s.career)!;
  const release = useGame((s) => s.release);
  const dig = useGame((s) => s.digCrate);
  const [sampleId, setSampleId] = useState("");
  const samples = c.samples ?? [];
  const freeDig = c.crateDay !== new Date().toISOString().slice(0, 10);
  const lvl = levelFor(c.stats.fame).level;
  const [pick, setPick] = useState<ReleaseKind | null>(null);
  const [title, setTitle] = useState("");
  const [withSong, setWithSong] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const aiOn = useAiFlags((s) => s.music);
  const signedIn = useCloud((s) => !!s.session);
  const aiLimit = useAiFlags((s) => s.dailyLimit + (s.vip ? s.vipBonus : 0));
  const aiCredits = useAiFlags((s) => s.credits);
  useAiFlags((s) => `${s.minLevel}:${s.songsTotal}:${s.vip}:${s.credits}`); // re-check access when these change
  const access = aiSongAccess(c.peakLevel ?? lvl);
  const def = RELEASES.find((r) => r.kind === pick);

  const open = (k: ReleaseKind) => {
    setPick(k);
    setSampleId("");
    setTitle(songTitle(Math.floor(Math.random() * 1e6)));
  };

  const go = () => {
    if (!pick) return;
    const r = release(pick, title.trim(), withSong, sampleId || undefined);
    toast(r);
    if (!r.ok) return;
    setPick(null);
    if (withSong && useAi && aiSongsAvailable() && access.ok) {
      const after = useGame.getState().career;
      const rel = after?.releases[0];
      const song = after?.songs.find((x) => x.id === rel?.songId);
      if (after && rel && song) {
        toast({ ok: true, title: "In the AI studio", message: `Recording "${song.title}" for real. It lands in your Locker in about a minute.` });
        void recordAiSong(song, rel.kind, after.persona).then((res) => toast({ ok: res.ok, message: res.message }));
      }
    }
  };

  return (
    <div>
      <PageTitle title="ALBUM" sub="Drop music. Quality depends on your credibility and hype." right={<Link to="/releases" className="font-pixel text-[8px] text-electric underline">ALL RELEASES</Link>} />
      <div className="grid grid-cols-2 gap-3">
        {RELEASES.map((r) => {
          const locked = lvl < r.level;
          return (
            <Card key={r.kind} className={`text-center ${locked ? "opacity-50" : ""}`}>
              <div className="text-4xl mb-2">{locked ? "🔒" : r.emoji}</div>
              <div className="font-pixel text-[10px]" style={{ color: "var(--neon-pink)" }}>{r.name.toUpperCase()}</div>
              <p className="text-[11px] text-muted-fg mt-2 min-h-[2.5em]">{r.blurb}</p>
              <div className="text-[11px] mt-2 space-y-0.5">
                <div>💸 {r.cost ? fmtMoney(r.cost) : "Free"} · ⚡ {r.energy}</div>
                <div className="text-muted-fg">{r.weeks} wk{r.weeks > 1 ? "s" : ""} in the studio</div>
              </div>
              {locked ? (
                <div className="mt-3"><Tag color="var(--gold)">LV{r.level}</Tag></div>
              ) : (
                <button className="btn btn-pink w-full mt-3" onClick={() => open(r.kind)}>Record</button>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-5" glow="gold">
        <div className="flex items-center justify-between gap-2">
          <div className="font-pixel text-[10px]" style={{ color: "var(--gold)" }}>📦 CRATE DIGGING</div>
          <span className="text-[11px] text-muted-fg">{samples.length}/{CRATE_MAX} records</span>
        </div>
        <p className="text-xs text-muted-fg mt-2">Dig through old records for samples. Flip one into your next release for a quality boost, bigger when it fits your sound.</p>
        <button className="btn btn-gold w-full mt-3" disabled={samples.length >= CRATE_MAX || (!freeDig && c.stats.energy < DIG_ENERGY)} onClick={() => toast(dig())}>
          {samples.length >= CRATE_MAX ? "Crate full" : freeDig ? "Dig a crate (free today)" : `Dig a crate ⚡${DIG_ENERGY}`}
        </button>
        {samples.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {samples.map((x) => (
              <li key={x.id} className="flex items-center gap-2 text-xs">
                <span>{RARITY[x.rarity].emoji}</span>
                <span className="flex-1 min-w-0 truncate">{x.name}</span>
                <span className="font-pixel text-[7px] shrink-0" style={{ color: RARITY[x.rarity].color }}>{RARITY[x.rarity].name.toUpperCase()}</span>
                <span className="tabular-nums shrink-0 text-muted-fg">+{sampleBoost(x, c.genre)}{x.genres.includes(c.genre) ? " ★" : ""}</span>
              </li>
            ))}
          </ul>
        )}
        {samples.length > 0 && <p className="text-[10px] text-muted-fg mt-2">★ fits your genre (1.5× boost). All records are fictional.</p>}
      </Card>

      <Modal open={!!def} onClose={() => setPick(null)}>
        {def && (
          <>
            <h3 className="font-pixel text-xs mb-4" style={{ color: "var(--gold)" }}>NEW {def.name.toUpperCase()}</h3>
            <label className="text-xs text-muted-fg">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 40))} className="w-full mt-1 mb-4 px-3 py-2 rounded bg-black/50 border border-line outline-none focus:border-pink" />
            <label className="flex items-start gap-3 mb-3 text-sm">
              <input type="checkbox" checked={withSong} onChange={(e) => setWithSong(e.target.checked)} className="mt-1 accent-[var(--neon-pink)]" />
              <span>Generate a song for this release <span className="block text-xs text-muted-fg">Saved to your Locker. Free.</span></span>
            </label>
            {withSong && aiOn && (access.ok ? (
              <label className="flex items-start gap-3 mb-3 text-sm">
                <input type="checkbox" checked={useAi && signedIn} disabled={!signedIn} onChange={(e) => setUseAi(e.target.checked)} className="mt-1 accent-[var(--gold)]" />
                <span>🎧 Record a real AI song <span className="block text-xs text-muted-fg">{!signedIn ? "Sign in to record real AI songs."
                  : access.why === "debut" ? `Your free debut recording: a real ~30s track in your genre. Daily AI songs unlock at level ${access.minLevel}.`
                  : access.why === "credits" ? `Uses 1 of your ${aiCredits} Studio Session songs. Daily free AI songs unlock at level ${access.minLevel}.`
                  : `A real ~30s track in your genre, made by the AI studio. ${aiLimit} free a day${aiCredits ? `, plus ${aiCredits} extra from your studio packs` : ""}.`}</span>
                  <span className="block text-[11px] text-muted-fg mt-1">AI songs belong to TourStar, LLC and may be released on streaming services in the TourStar Monthly with your artist name. You won't be paid for them. <a className="underline" href="https://tourstarapp.com/terms#content" target="_blank" rel="noreferrer">Terms</a></span></span>
              </label>
            ) : (
              <div className="flex items-start gap-3 mb-3 text-sm opacity-80">
                <span className="text-lg leading-none mt-0.5">🔒</span>
                <span>Real AI songs unlock at level {access.minLevel}
                  <span className="block text-xs text-muted-fg">You're level {c.peakLevel ?? lvl}. Keep touring to unlock daily AI songs, or <Link to="/premium" className="underline" style={{ color: "var(--gold)" }}>get a Studio Session</Link> to record now.</span>
                  <span className="block h-1.5 rounded bg-black/40 mt-2 overflow-hidden"><span className="block h-full" style={{ width: `${Math.min(100, ((c.peakLevel ?? lvl) / access.minLevel) * 100)}%`, background: "var(--gold)" }} /></span></span>
              </div>
            ))}
            {samples.length > 0 && (
              <>
                <label className="text-xs text-muted-fg">Flip a sample</label>
                <select value={sampleId} onChange={(e) => setSampleId(e.target.value)} className="w-full mt-1 mb-4 px-3 py-2 rounded bg-black/50 border border-line outline-none focus:border-pink text-sm">
                  <option value="">No sample</option>
                  {[...samples].sort((a, b) => sampleBoost(b, c.genre) - sampleBoost(a, c.genre)).map((x) => <option key={x.id} value={x.id}>{RARITY[x.rarity].emoji} {x.name} · +{sampleBoost(x, c.genre)} quality</option>)}
                </select>
              </>
            )}
            <div className="text-xs text-muted-fg mb-4">Costs {def.cost ? fmtMoney(def.cost) : "nothing"} and {def.energy} energy. You have {fmtMoney(c.stats.cash)} / ⚡{c.stats.energy}.</div>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setPick(null)}>Cancel</button>
              <button className="btn btn-pink flex-1" onClick={go}>Release</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
