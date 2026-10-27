import { useState } from "react";
import { Link } from "react-router-dom";
import { RELEASES } from "../game/data";
import { fmtMoney, levelFor } from "../game/engine";
import { useGame } from "../game/store";
import type { ReleaseKind } from "../game/types";
import { Card, Modal, PageTitle, Tag, toast } from "../components/ui";
import { MUSIC_SERVICES } from "../components/SongGenerator";
import { songTitle } from "../lib/chiptune";

export default function Album() {
  const c = useGame((s) => s.career)!;
  const release = useGame((s) => s.release);
  const lvl = levelFor(c.stats.fame).level;
  const [pick, setPick] = useState<ReleaseKind | null>(null);
  const [title, setTitle] = useState("");
  const [withSong, setWithSong] = useState(true);
  const [typed, setTyped] = useState("");
  const def = RELEASES.find((r) => r.kind === pick);
  const svc = MUSIC_SERVICES[0];

  const open = (k: ReleaseKind) => {
    setPick(k);
    setTitle(songTitle(Math.floor(Math.random() * 1e6)));
    setTyped("");
  };

  const go = () => {
    if (!pick) return;
    const r = release(pick, title.trim(), withSong);
    toast(r);
    if (r.ok) setPick(null);
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

      <Modal open={!!def} onClose={() => setPick(null)}>
        {def && (
          <>
            <h3 className="font-pixel text-xs mb-4" style={{ color: "var(--gold)" }}>NEW {def.name.toUpperCase()}</h3>
            <label className="text-xs text-muted-fg">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 40))} className="w-full mt-1 mb-4 px-3 py-2 rounded bg-black/50 border border-line outline-none focus:border-pink" />
            <label className="flex items-start gap-3 mb-3 text-sm">
              <input type="checkbox" checked={withSong} onChange={(e) => setWithSong(e.target.checked)} className="mt-1 accent-[var(--neon-pink)]" />
              <span>Generate a song for this release <span className="block text-xs text-muted-fg">Saved to your Locker. Uses {svc.label} ({svc.cost ? `$${svc.cost}` : "free"}).</span></span>
            </label>
            {withSong && svc.cost > 0 && (
              <>
                <label className="text-xs text-muted-fg">Type <b className="text-fg">{svc.name}</b> to confirm the music service</label>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full mt-1 mb-4 px-3 py-2 rounded bg-black/50 border border-line outline-none focus:border-pink" />
              </>
            )}
            <div className="text-xs text-muted-fg mb-4">Costs {def.cost ? fmtMoney(def.cost) : "nothing"} and {def.energy} energy. You have {fmtMoney(c.stats.cash)} / ⚡{c.stats.energy}.</div>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setPick(null)}>Cancel</button>
              <button className="btn btn-pink flex-1" disabled={withSong && svc.cost > 0 && typed.trim().toLowerCase() !== svc.name.toLowerCase()} onClick={go}>Release</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
