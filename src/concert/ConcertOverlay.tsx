import { useEffect, useMemo, useRef, useState } from "react";
import { TOURS } from "../game/data";
import { fmtMoney } from "../game/engine";
import { useGame, type ActionResult } from "../game/store";
import { GRADE_LABEL, debutChance, songPool, type EncoreChoice } from "../game/setlist";
import { makeMedley, playMedley, type MedleyHandle } from "../lib/chiptune";
import { cheer, sfx, vibrate } from "../lib/fx";
import { DeltaChips, toast } from "../components/ui";
import { startConcert } from "./ConcertScene";
import { useConcert } from "./useConcert";
import NoteHighway, { type HighwayResult, type Judge } from "./NoteHighway";

type Phase = "play" | "encore" | "result";
const GRADE_COLOR: Record<string, string> = { S: "var(--gold)", A: "var(--neon-pink)", B: "var(--electric)", C: "var(--muted-foreground)", D: "var(--danger)" };

export default function ConcertOverlay() {
  const show = useConcert((s) => s.show)!;
  const close = useConcert((s) => s.close);
  const career = useGame((s) => s.career)!;
  const finishShow = useGame((s) => s.finishShow);
  const tour = TOURS.find((t) => t.id === show.tourId)!;
  const crowdTotal = Math.round(tour.capacity * show.attendance);

  // Freeze the songs at the start so the setlist doesn't shift as plays are counted.
  const songs = useMemo(() => {
    const pool = songPool(career);
    return show.setlist.map((k) => pool.find((p) => p.key === k)).filter((s): s is NonNullable<typeof s> => !!s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const medley = useMemo(() => makeMedley(songs.map((s) => s.seed), career.genre, Math.min(1, (tour.level - 1) / 5)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof startConcert> | null>(null);
  const musicRef = useRef<MedleyHandle | null>(null);
  const energy = useRef(0.55);
  const [phase, setPhase] = useState<Phase>("play");
  const [k, setK] = useState(0);
  const [nowSong, setNowSong] = useState(0);
  const [hw, setHw] = useState<HighwayResult | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [clock, setClock] = useState<(() => number) | null>(null);

  useEffect(() => {
    musicRef.current = playMedley(songs.map((s) => s.seed), career.genre, medley);
    setClock(() => musicRef.current!.now);
    const scene = startConcert(stageRef.current!, {
      attendance: show.attendance,
      beatSec: medley.stepSec * 2,
      pyro: !!career.crew.pyro,
      lighting: !!career.crew.lighting,
      sellout: show.sellout,
      onPyro: () => { sfx("coin"); vibrate(40); },
    });
    sceneRef.current = scene;
    let cheered = false;
    const timer = window.setInterval(() => {
      const t = musicRef.current?.now() ?? 0;
      const p = Math.max(0, Math.min(1, t / medley.durationSec));
      scene.setProgress(p);
      setK(p);
      let idx = 0;
      medley.songStarts.forEach((s, i) => { if (t >= s) idx = i; });
      setNowSong(idx);
      if (!cheered && p > 0.6 && energy.current > 0.5) { cheered = true; cheer(); }
      if (p >= 1) window.clearInterval(timer);
    }, 80);
    return () => { window.clearInterval(timer); scene.destroy(); musicRef.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onJudge = (j: Judge, combo: number) => {
    energy.current = Math.max(0, Math.min(1, energy.current + (j === "perfect" ? 0.06 : j === "good" ? 0.03 : -0.09)));
    sceneRef.current?.setEnergy(energy.current);
    if (j === "miss") vibrate(25);
    else if (combo > 0 && combo % 10 === 0) { sfx("coin"); vibrate(30); }
  };

  const onDone = (r: HighwayResult) => {
    setHw(r);
    sceneRef.current?.setProgress(1);
    setPhase("encore");
    sfx("click");
  };

  const autoPlay = () => {
    musicRef.current?.stop();
    onDone({ perfect: 0, good: 0, miss: 0, total: 0, maxCombo: 0, accuracy: 0.5 });
  };

  const encore = (choice: EncoreChoice) => {
    const r = finishShow(hw?.accuracy ?? 0.5, choice);
    if (!r.ok || !r.gig) { toast(r); close(); return; }
    setResult(r);
    setPhase("result");
    const g = r.gig.grade;
    if (g === "S" || g === "A" || r.gig.sellout) { sfx("levelup"); vibrate([60, 40, 120]); cheer(); }
  };

  const e = Math.min(1, k * 1.4);
  const crowd = phase !== "play" ? crowdTotal : Math.round(crowdTotal * e * e * (3 - 2 * e));
  const gig = result?.gig;
  const accPct = Math.round((hw?.accuracy ?? 0.5) * 100);

  return (
    <div className="fixed inset-0 z-[80] flex justify-center bg-[#05040f]">
      <div className="w-full max-w-md flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-between items-center px-4 pt-3 font-pixel text-[10px]">
          <span className="animate-press-start" style={{ color: "var(--danger)" }}>● LIVE</span>
          <span style={{ color: "var(--gold)" }}>{tour.name.toUpperCase()}</span>
        </div>
        <div className="px-4 pb-2 pt-1 flex justify-between items-baseline text-xs">
          <span className="truncate">
            <span className="text-muted-fg">Now playing </span>
            <b>{songs[nowSong]?.title}</b>
            {songs[nowSong]?.key === show.requestKey && <span className="ml-1" style={{ color: "var(--gold)" }}>🙋 request</span>}
          </span>
          <span className="tabular-nums text-muted-fg shrink-0 ml-2">{Math.min(nowSong + 1, songs.length)}/{songs.length}</span>
        </div>

        <div className="flex-1 min-h-0 relative overflow-hidden">
          <div ref={stageRef} className="absolute inset-0" />
          {phase === "play" && clock && (
            <div className="absolute inset-x-0 bottom-0 h-[62%]">
              <NoteHighway medley={medley} now={clock} onJudge={onJudge} onDone={onDone} />
            </div>
          )}
        </div>

        <div className="px-4 pt-3 pb-5">
          {phase === "play" && (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="font-pixel text-base tabular-nums" style={{ color: "var(--gold)" }}>{crowd.toLocaleString()}</div>
                <div className="text-[11px] text-muted-fg mt-1">fans · capacity {tour.capacity.toLocaleString()}</div>
              </div>
              <button className="btn btn-ghost text-xs" onClick={autoPlay}>Auto-play ▶▶</button>
            </div>
          )}

          {phase === "encore" && (
            <div className="panel p-4 animate-pop" style={{ borderColor: "var(--neon-pink)", borderWidth: 2 }}>
              <div className="font-pixel text-sm text-center" style={{ color: "var(--neon-pink)" }}>ENCORE! ENCORE!</div>
              <p className="text-xs text-center text-muted-fg mt-2">
                {hw && hw.total > 0 ? <>Hit {accPct}% · best combo {hw.maxCombo}. </> : <>You let the band carry it. </>}
                How do you close the night?
              </p>
              <div className="grid gap-2 mt-3">
                <button className="btn btn-primary text-left" onClick={() => encore("hit")}>
                  <b>Play the hit again</b><span className="block text-[11px] opacity-80">Safe: +10% pay and fame</span>
                </button>
                <button className="btn btn-pink text-left" onClick={() => encore("debut")}>
                  <b>Debut a new song</b><span className="block text-[11px] opacity-80">{Math.round(debutChance(hw?.accuracy ?? 0.5) * 100)}% chance it lands: +30% fame, hype, and a new song for your sets. If it flops: hype drops.</span>
                </button>
                <button className="btn btn-ghost text-left" onClick={() => encore("walk")}>
                  <b>Walk off</b><span className="block text-[11px] opacity-80">Leave them wanting more: +4 health</span>
                </button>
              </div>
            </div>
          )}

          {phase === "result" && gig && (
            <div className="panel p-4 animate-pop" style={{ borderColor: GRADE_COLOR[gig.grade], borderWidth: 2 }}>
              <div className="flex items-center gap-4">
                <div className="font-pixel text-5xl" style={{ color: GRADE_COLOR[gig.grade] }}>{gig.grade}</div>
                <div className="min-w-0">
                  <div className="font-pixel text-[11px] leading-relaxed" style={{ color: GRADE_COLOR[gig.grade] }}>{GRADE_LABEL[gig.grade]}</div>
                  {gig.sellout && <div className="font-pixel text-[9px] mt-1" style={{ color: "var(--neon-pink)" }}>SOLD OUT!</div>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <Stat label="Playing" value={`${Math.round(gig.performance * 100)}%`} />
                <Stat label="Setlist" value={`${Math.round(gig.setlist * 100)}%`} />
                <Stat label="Crowd" value={gig.crowd.toLocaleString()} />
              </div>
              <ul className="text-xs mt-3 space-y-1 text-muted-fg">
                <li>Netted <b className="text-fg">{fmtMoney(gig.net)}</b></li>
                {gig.playedRequest && <li>🙋 You played the fan request. The crowd loved it.</li>}
                {gig.encore === "debut" && (gig.encoreLanded
                  ? <li>✨ "{gig.debutTitle}" landed. It's in your Locker and setlist now.</li>
                  : <li>😬 The new song fell flat.</li>)}
              </ul>
              {result?.delta && <DeltaChips delta={result.delta} className="justify-center mt-3" />}
              <button className="btn btn-primary w-full mt-4" onClick={close}>Continue</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-black/40 py-2">
      <div className="font-pixel text-[10px] tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-fg mt-1">{label}</div>
    </div>
  );
}
