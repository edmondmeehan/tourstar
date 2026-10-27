import { useEffect, useRef, useState } from "react";
import { GENRES } from "../game/data";
import { fmtMoney } from "../game/engine";
import { useGame } from "../game/store";
import { playSong, type PlayHandle } from "../lib/chiptune";
import { cheer, sfx, vibrate } from "../lib/fx";
import { DeltaChips } from "../components/ui";
import { startConcert } from "./ConcertScene";
import { useConcert } from "./useConcert";

const SHOW_SECONDS = 7.5;

export default function ConcertOverlay() {
  const result = useConcert((s) => s.result)!;
  const close = useConcert((s) => s.close);
  const career = useGame((s) => s.career)!;
  const gig = result.gig!;
  const stageRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const [done, setDone] = useState(false);
  const skipped = useRef(false);
  const showRef = useRef<{ setProgress: (k: number) => void } | null>(null);

  useEffect(() => {
    const genre = GENRES[career.genre];
    const last = career.songs[career.songs.length - 1];
    let song: PlayHandle | null = null;
    try {
      song = playSong(last ? last.seed : (career.week * 7919) % 1e9, career.genre);
    } catch { /* no audio */ }
    const show = startConcert(stageRef.current!, {
      attendance: gig.crowd / Math.max(1, gig.capacity),
      beatSec: 60 / genre.tempo,
      pyro: gig.pyro,
      lighting: gig.lighting,
      sellout: gig.sellout,
      onPyro: () => { sfx("coin"); vibrate(40); },
    });
    showRef.current = show;
    const start = performance.now();
    let cheered = false;
    const timer = window.setInterval(() => {
      if (skipped.current) { window.clearInterval(timer); return; }
      const p = Math.min(1, (performance.now() - start) / 1000 / SHOW_SECONDS);
      show.setProgress(p);
      setK(p);
      if (!cheered && p > 0.6) { cheered = true; cheer(); }
      if (p >= 1) window.clearInterval(timer);
    }, 50);
    return () => { window.clearInterval(timer); show.destroy(); song?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (k >= 1 && !done) {
      setDone(true);
      if (gig.sellout) { sfx("levelup"); vibrate([60, 40, 120]); }
    }
  }, [k, done, gig.sellout]);

  const skip = () => { skipped.current = true; showRef.current?.setProgress(1); setK(1); };
  const e = Math.min(1, k * 1.4);
  const crowd = done ? gig.crowd : Math.round(gig.crowd * e * e * (3 - 2 * e));

  return (
    <div className="fixed inset-0 z-[80] flex justify-center bg-[#05040f]">
      <div className="w-full max-w-md flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-between items-center px-4 py-3 font-pixel text-[10px]">
          <span className="animate-press-start" style={{ color: "var(--danger)" }}>● LIVE</span>
          <span style={{ color: "var(--gold)" }}>{gig.tourName.toUpperCase()}</span>
        </div>
        <div ref={stageRef} className="flex-1 min-h-0 relative overflow-hidden" />
        <div className="px-4 pt-3 pb-5">
          {!done ? (
            <>
              <div className="font-pixel text-xl text-center" style={{ color: "var(--gold)" }}>{Math.min(gig.crowd, crowd).toLocaleString()}</div>
              <div className="text-xs text-muted-fg text-center mt-2">fans in the building · capacity {gig.capacity.toLocaleString()}</div>
              <button className="btn btn-ghost w-full mt-3" onClick={skip}>Skip ▶▶</button>
            </>
          ) : (
            <div className="panel p-4 animate-pop" style={{ borderColor: gig.sellout ? "var(--neon-pink)" : "var(--electric)", borderWidth: 2 }}>
              <div className="font-pixel text-base text-center" style={{ color: gig.sellout ? "var(--neon-pink)" : "var(--electric)" }}>{gig.sellout ? "SOLD OUT!" : "SHOW'S OVER"}</div>
              <p className="text-sm text-center mt-3">{gig.crowd.toLocaleString()} of {gig.capacity.toLocaleString()} fans · netted {fmtMoney(gig.net)}</p>
              {result.delta && <DeltaChips delta={result.delta} className="justify-center mt-3" />}
              <button className="btn btn-primary w-full mt-4" onClick={close}>Continue</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
