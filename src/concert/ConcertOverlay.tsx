import { useEffect, useMemo, useRef, useState } from "react";
import { TOURS } from "../game/data";
import { fmtMoney } from "../game/engine";
import { useGame, type ActionResult } from "../game/store";
import { GRADE_LABEL, debutChance, songPool, type EncoreChoice } from "../game/setlist";
import { makeMedley, playMedley, type MedleyHandle } from "../lib/chiptune";
import { cheer, masterVolume, sfx } from "../lib/fx";
import { haptic } from "../lib/haptics";
import { playClip, useAiFlags, type ClipHandle } from "../lib/ai";
import { DeltaChips, toast } from "../components/ui";
import { startConcert } from "./ConcertScene";
import { DIFFICULTIES, showTuning } from "../game/difficulty";
import { stageTheme } from "../game/cosmetics";
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
  const capacity = show.venue?.capacity || tour.capacity;
  const venueName = show.venue?.name ?? tour.name;
  const crowdTotal = Math.round(capacity * show.attendance);

  // Freeze the songs at the start so the setlist doesn't shift as plays are counted.
  const songs = useMemo(() => {
    const pool = songPool(career);
    return show.setlist.map((k) => pool.find((p) => p.key === k)).filter((s): s is NonNullable<typeof s> => !!s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const diff = show.difficulty ?? "normal";
  const tuning = useMemo(() => showTuning(tour.level, diff), [tour.level, diff]);
  const medley = useMemo(() => makeMedley(songs.map((s) => s.seed), career.genre, tuning.density),
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
  const musicStopped = useRef(false);
  const introRef = useRef<ClipHandle | null>(null);
  const [announcing, setAnnouncing] = useState(false);

  useEffect(() => {
    let disposed = false;
    const startMusic = () => {
      if (disposed || musicStopped.current || musicRef.current) return;
      setAnnouncing(false);
      musicRef.current = playMedley(songs.map((s) => s.seed), career.genre, medley);
      setClock(() => musicRef.current!.now);
    };
    // The stadium announcer (AI voice) introduces the artist, then the band kicks in.
    const intro = career.announcerUrl && career.announcerFor === career.name && useAiFlags.getState().voice && masterVolume() > 0;
    if (intro) {
      setAnnouncing(true);
      introRef.current = playClip(career.announcerUrl!, { gain: 1.2 });
      cheer();
      void introRef.current.done.then(startMusic);
      window.setTimeout(startMusic, 9000); // never hold the show hostage to a slow clip
    } else startMusic();
    const scene = startConcert(stageRef.current!, {
      attendance: show.attendance,
      beatSec: medley.stepSec * 2,
      pyro: !!career.crew.pyro,
      lighting: !!career.crew.lighting,
      sellout: show.sellout,
      onPyro: () => sfx("coin", "pyro"),
      theme: stageTheme(show.venue?.theme || career.style?.stage),
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
    // Feel the music: taps on the 4-count sticks, then a light tap on every kick drum (every 8 steps).
    const INTRO = 2;
    const beats: { t: number; feel: "select" | "kick" }[] = [];
    for (let i = 0; i < 4; i++) beats.push({ t: INTRO - (4 - i) * medley.stepSec * 2, feel: "select" });
    for (let t = INTRO; t < medley.durationSec - 0.05; t += medley.stepSec * 8) beats.push({ t, feel: "kick" });
    let nextBeat = 0;
    let raf = 0;
    const feel = () => {
      const t = musicRef.current?.now() ?? 0;
      while (nextBeat < beats.length && beats[nextBeat].t <= t) {
        if (t - beats[nextBeat].t < 0.12) haptic(beats[nextBeat].feel === "kick" ? "kick" : [{ at: 0, tap: "select" }]);
        nextBeat++;
      }
      if (nextBeat < beats.length && !musicStopped.current) raf = requestAnimationFrame(feel);
    };
    raf = requestAnimationFrame(feel);
    return () => { disposed = true; window.clearInterval(timer); cancelAnimationFrame(raf); scene.destroy(); introRef.current?.stop(); musicRef.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onJudge = (j: Judge, combo: number) => {
    energy.current = Math.max(0, Math.min(1, energy.current + (j === "perfect" ? 0.06 : j === "good" ? 0.03 : -0.09)));
    sceneRef.current?.setEnergy(energy.current);
    if (combo > 0 && combo % 10 === 0) sfx("coin", "combo");
    else haptic(j);
  };

  const onDone = (r: HighwayResult) => {
    setHw(r);
    sceneRef.current?.setProgress(1);
    setPhase("encore");
    sfx("click");
  };

  const autoPlay = () => {
    musicStopped.current = true;
    introRef.current?.stop();
    musicRef.current?.stop();
    onDone({ perfect: 0, good: 0, miss: 0, total: 0, maxCombo: 0, accuracy: 0.5 });
  };

  const encore = (choice: EncoreChoice) => {
    const r = finishShow(hw?.accuracy ?? 0.5, choice);
    if (!r.ok || !r.gig) { toast(r); close(); return; }
    setResult(r);
    setPhase("result");
    const g = r.gig.grade;
    if (g === "S" || g === "A" || r.gig.sellout) { sfx("levelup"); window.setTimeout(cheer, 650); }
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
          <span style={{ color: "var(--gold)" }}>{venueName.toUpperCase()}{diff !== "normal" && <span style={{ color: DIFFICULTIES[diff].color }}> · {DIFFICULTIES[diff].label.toUpperCase()}</span>}</span>
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
          {announcing && phase === "play" && (
            <div className="absolute inset-x-0 top-[30%] text-center pointer-events-none animate-pop">
              <div className="font-pixel text-[10px] text-muted-fg">PLEASE WELCOME TO THE STAGE</div>
              <div className="font-pixel text-lg mt-2" style={{ color: "var(--gold)" }}>{career.name.toUpperCase()}</div>
            </div>
          )}
          {phase === "play" && clock && (
            <div className="absolute inset-x-0 bottom-0 h-[62%]">
              <NoteHighway medley={medley} now={clock} onJudge={onJudge} onDone={onDone} tuning={tuning} />
            </div>
          )}
        </div>

        <div className="px-4 pt-3 pb-5">
          {phase === "play" && (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="font-pixel text-base tabular-nums" style={{ color: "var(--gold)" }}>{crowd.toLocaleString()}</div>
                <div className="text-[11px] text-muted-fg mt-1">fans · capacity {capacity.toLocaleString()}</div>
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
                  {gig.difficulty !== "normal" && <div className="font-pixel text-[9px] mt-1" style={{ color: DIFFICULTIES[gig.difficulty].color }}>{DIFFICULTIES[gig.difficulty].emoji} {DIFFICULTIES[gig.difficulty].label.toUpperCase()}{gig.difficulty === "hard" ? " · +25% PAY & FAME" : ""}</div>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <Stat label="Playing" value={`${Math.round(gig.performance * 100)}%`} />
                <Stat label="Setlist" value={`${Math.round(gig.setlist * 100)}%`} />
                <Stat label="Crowd" value={gig.crowd.toLocaleString()} />
              </div>
              <ul className="text-xs mt-3 space-y-1 text-muted-fg">
                <li>Netted <b className="text-fg">{fmtMoney(gig.net)}</b>{!!result?.points && <> · <b style={{ color: "var(--gold)" }}>+{result.points} ⭐ points</b></>}</li>
                {result?.points === 0 && <li>⭐ You've earned today's show points. Quests and your daily reward still earn more.</li>}
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
