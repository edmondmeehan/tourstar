// Drum School: play real grooves on kick, snare and hi-hat. Graded lessons cost a little energy and
// pay cash and fame; passing with an A or S earns chops (a bonus to the playing score at shows).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { useGame } from "../game/store";
import { levelFor } from "../game/engine";
import { CHOPS_CAP, CHOPS_PER_LESSON, DRUM_COLORS, DRUM_LANES, LESSONS, LESSON_ENERGY, LESSONS_PER_DAY, drumChops, drumGrade, lessonChart, type Lesson } from "../game/drums";
import type { Grade } from "../game/setlist";
import { Card, DeltaChips, PageTitle, Tag, toast } from "../components/ui";
import NoteHighway, { type HighwayResult, type Judge } from "../concert/NoteHighway";
import { playLesson, type DrumHandle } from "../lib/drumkit";
import { haptic } from "../lib/haptics";
import { sfx } from "../lib/fx";
import { useLiveCorner, type DrumCorner } from "../lib/corner";
import type { ActionResult } from "../game/store";

const GRADE_COLOR: Record<string, string> = { S: "var(--gold)", A: "var(--neon-pink)", B: "var(--electric)", C: "var(--muted-foreground)", D: "var(--danger)" };
const TUNING = { approach: 1.5, perfect: 0.07, good: 0.14 };

export default function DrumSchool() {
  const c = useGame((s) => s.career)!;
  const start = useGame((s) => s.startDrumLesson);
  const corner = useLiveCorner();
  const [playing, setPlaying] = useState<{ lesson: Lesson; practice: boolean } | null>(null);
  const lvl = Math.max(c.peakLevel, levelFor(c.stats.fame).level);
  const best = c.drums?.best ?? {};
  const chops = drumChops(best);
  const today = new Date().toISOString().slice(0, 10);
  const left = Math.max(0, LESSONS_PER_DAY - (c.drums?.day === today ? c.drums.n ?? 0 : 0));

  const go = (lesson: Lesson, practice: boolean) => {
    if (!practice) {
      const r = start(lesson.id);
      if (!r.ok) return toast(r);
    }
    setPlaying({ lesson, practice });
  };

  return (
    <div>
      <PageTitle title={corner ? corner.title.toUpperCase() : "DRUM SCHOOL"} sub={corner?.tagline || "Learn real grooves on the kit. Kick, snare, hi-hat."} right={<Link to="/how-to-play" className="font-pixel text-[8px] text-electric underline">HOW IT WORKS</Link>} />
      {corner && <HostCard corner={corner} />}

      <Card glow="gold" className="mb-4">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🥁</div>
          <div className="flex-1 min-w-0">
            <div className="font-pixel text-[10px]" style={{ color: "var(--gold)" }}>CHOPS +{chops}%</div>
            <p className="text-xs text-muted-fg mt-1">Every lesson you pass with an A or S adds +{CHOPS_PER_LESSON}% to your playing score at every show (up to +{CHOPS_CAP}%).</p>
            <div className="h-1.5 rounded bg-black/40 mt-2 overflow-hidden"><div className="h-full" style={{ width: `${(chops / CHOPS_CAP) * 100}%`, background: "var(--gold)" }} /></div>
          </div>
        </div>
        <p className="text-[11px] text-muted-fg mt-3">Lessons cost ⚡{LESSON_ENERGY} and pay cash and fame ({left} of {LESSONS_PER_DAY} paid lessons left today). Practice is always free.</p>
      </Card>

      <div className="space-y-3">
        {LESSONS.map((l) => {
          const locked = lvl < l.level;
          const g = best[l.id] as Grade | undefined;
          return (
            <Card key={l.id} className={locked ? "opacity-50" : ""}>
              <div className="flex items-start gap-3">
                <div className="text-3xl">{locked ? "🔒" : l.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{l.name}</span>
                    <Tag>{l.style}</Tag>
                    <Tag>{l.bpm} BPM</Tag>
                  </div>
                  {corner?.tips[l.id]
                    ? <p className="text-xs mt-1"><b style={{ color: "var(--gold)" }}>{corner.host}:</b> <span className="text-muted-fg">"{corner.tips[l.id]}"</span></p>
                    : <p className="text-xs text-muted-fg mt-1">{l.tip}</p>}
                  <Groove l={l} />
                </div>
                {g && <div className="font-pixel text-xl" style={{ color: GRADE_COLOR[g] }} title="Best grade">{g}</div>}
              </div>
              {locked ? <div className="mt-3"><Tag color="var(--gold)">LV{l.level}</Tag></div> : (
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-ghost flex-1 text-xs" onClick={() => go(l, true)}>Practice (free)</button>
                  <button className="btn btn-pink flex-1 text-xs" disabled={c.stats.energy < LESSON_ENERGY} onClick={() => go(l, false)}>Lesson ⚡{LESSON_ENERGY}</button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-fg text-center mt-4">Tap the lanes, or use ← ↓ → / A S D on a keyboard. Two notes at once? Tap with two fingers.</p>

      {playing && createPortal(<LessonPlayer lesson={playing.lesson} practice={playing.practice} corner={corner} onClose={() => setPlaying(null)} />, document.body)}
    </div>
  );
}

/** The groove written out: one row per drum, 16 steps. */
function Groove({ l }: { l: Lesson }) {
  return (
    <div className="mt-2 space-y-0.5" aria-label={`${l.name} pattern`}>
      {[l.hat, l.snare, l.kick].map((p, r) => (
        <div key={r} className="flex items-center gap-1">
          <span className="font-pixel text-[6px] w-9 text-muted-fg">{DRUM_LANES[2 - r]}</span>
          <div className="flex gap-[2px]">
            {p.split("").map((ch, i) => <span key={i} className={`block w-2 h-2 rounded-sm ${i % 4 === 0 ? "ml-[2px]" : ""}`} style={{ background: ch === "x" ? DRUM_COLORS[2 - r] : "rgba(255,255,255,0.08)" }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function HostCard({ corner }: { corner: DrumCorner }) {
  return (
    <Card glow="pink" className="mb-4">
      <div className="flex gap-3">
        {corner.photo_url
          ? <img src={corner.photo_url} alt={corner.host} className="w-20 h-20 rounded-lg object-cover shrink-0 border border-line" loading="lazy" />
          : <div className="w-20 h-20 rounded-lg shrink-0 bg-black/40 flex items-center justify-center text-4xl">🥁</div>}
        <div className="min-w-0">
          <div className="font-pixel text-[8px]" style={{ color: "var(--neon-pink)" }}>YOUR HOST</div>
          <div className="font-bold text-lg leading-tight mt-1">{corner.host}</div>
          {corner.bio && <p className="text-xs text-muted-fg mt-1 leading-relaxed">{corner.bio}</p>}
        </div>
      </div>
      {corner.quote && <p className="text-sm italic mt-3 border-l-2 pl-3" style={{ borderColor: "var(--gold)" }}>"{corner.quote}"</p>}
      {corner.link_url && <a href={corner.link_url} target="_blank" rel="noreferrer" className="btn btn-ghost w-full text-xs mt-3 block text-center">{corner.link_label || `More from ${corner.host}`} ↗</a>}
    </Card>
  );
}

function LessonPlayer({ lesson, practice, corner, onClose }: { lesson: Lesson; practice: boolean; corner: DrumCorner | null; onClose: () => void }) {
  const finish = useGame((s) => s.finishDrumLesson);
  const chart = useMemo(() => lessonChart(lesson), [lesson]);
  const kit = useRef<DrumHandle | null>(null);
  const [clock, setClock] = useState<(() => number) | null>(null);
  const [res, setRes] = useState<{ hw: HighwayResult; grade: Grade; r?: ActionResult } | null>(null);
  const [combo, setCombo] = useState(0);
  const [hits, setHits] = useState<number[]>([0, 0, 0]);

  useEffect(() => {
    kit.current = playLesson(lesson);
    setClock(() => kit.current!.now);
    return () => kit.current?.stop();
  }, [lesson]);

  const onTap = (lane: number) => {
    kit.current?.hit(lane);
    setHits((h) => h.map((v, i) => (i === lane ? v + 1 : v)));
  };
  const onJudge = (j: Judge, c: number) => { setCombo(c); if (c > 0 && c % 16 === 0) sfx("coin", "combo"); else haptic(j); };
  const onDone = (hw: HighwayResult) => {
    kit.current?.stop();
    const grade = drumGrade(hw.accuracy);
    if (practice) { setRes({ hw, grade }); return; }
    const r = finish(lesson.id, hw.accuracy);
    setRes({ hw, grade, r });
    if (r.firstPass) sfx("levelup");
  };
  const quit = () => {
    kit.current?.stop();
    if (!practice && !res) toast({ ok: false, message: "Lesson ended early. No reward this time." });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex justify-center bg-[#08060f]">
      <div className="w-full max-w-md flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-between items-center px-4 pt-3 font-pixel text-[10px]">
          <span style={{ color: "var(--gold)" }}>🥁 {lesson.name.toUpperCase()}</span>
          <span className="text-muted-fg">{practice ? "PRACTICE" : "LESSON"} · {lesson.bpm} BPM</span>
        </div>
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <Kit hits={hits} />
          {combo >= 8 && !res && <div className="absolute top-3 inset-x-0 text-center font-pixel text-[10px]" style={{ color: "var(--gold)" }}>IN THE POCKET</div>}
          {clock && !res && (
            <div className="absolute inset-x-0 bottom-0 h-[70%]">
              <NoteHighway medley={chart} now={clock} onJudge={onJudge} onDone={onDone} tuning={TUNING} onTap={onTap}
                lanes={{ labels: DRUM_LANES, colors: DRUM_COLORS }} hint="KICK · SNARE · HAT" />
            </div>
          )}
        </div>
        <div className="px-4 pt-3 pb-5">
          {!res ? <button className="btn btn-ghost w-full text-xs" onClick={quit}>Stop</button> : (
            <div className="panel p-4 animate-pop" style={{ borderColor: GRADE_COLOR[res.grade], borderWidth: 2 }}>
              <div className="flex items-center gap-4">
                <div className="font-pixel text-5xl" style={{ color: GRADE_COLOR[res.grade] }}>{res.grade}</div>
                <div className="text-sm">
                  <div>Hit {Math.round(res.hw.accuracy * 100)}% · best combo {res.hw.maxCombo}</div>
                  <div className="text-xs text-muted-fg mt-1">{res.hw.perfect} perfect · {res.hw.good} good · {res.hw.miss} missed</div>
                </div>
              </div>
              {corner?.sign_off && (res.grade === "S" || res.grade === "A") && <p className="text-sm italic mt-3" style={{ color: "var(--gold)" }}>"{corner.sign_off}" <span className="not-italic text-muted-fg text-xs">— {corner.host}</span></p>}
              {res.r ? <p className="text-xs text-muted-fg mt-3">{res.r.message}</p>
                : <p className="text-xs text-muted-fg mt-3">Practice run. Take a paid lesson to earn rewards and chops.</p>}
              {res.r?.delta && Object.keys(res.r.delta).length > 0 && <DeltaChips delta={res.r.delta} className="justify-center mt-3" />}
              <button className="btn btn-primary w-full mt-4" onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A little pixel drum kit that flashes as you play. */
function Kit({ hits }: { hits: number[] }) {
  const [lit, setLit] = useState([0, 0, 0]);
  const prev = useRef(hits);
  useEffect(() => {
    const changed = hits.map((h, i) => (h !== prev.current[i] ? 1 : 0));
    prev.current = hits;
    if (!changed.some(Boolean)) return;
    setLit(changed);
    const t = window.setTimeout(() => setLit([0, 0, 0]), 90);
    return () => window.clearTimeout(t);
  }, [hits]);
  const glow = (i: number) => (lit[i] ? `drop-shadow(0 0 8px ${DRUM_COLORS[i]})` : "none");
  return (
    <svg viewBox="0 0 120 56" className="absolute left-1/2 -translate-x-1/2 top-[6%] w-[62%] max-w-[260px]" shapeRendering="crispEdges" aria-hidden>
      {/* hi-hat */}
      <g style={{ filter: glow(2) }}>
        <rect x="90" y={lit[2] ? 13 : 12} width="24" height="3" fill={DRUM_COLORS[2]} />
        <rect x="90" y="16" width="24" height="2" fill="#a88a2a" />
        <rect x="101" y="18" width="2" height="30" fill="#777" />
      </g>
      {/* crash */}
      <rect x="6" y="8" width="26" height="3" fill="#c9a43a" />
      <rect x="18" y="11" width="2" height="36" fill="#777" />
      {/* snare */}
      <g style={{ filter: glow(1) }}>
        <rect x="70" y="30" width="20" height="8" fill={lit[1] ? "#ffffff" : "#e8e8e8"} />
        <rect x="70" y="30" width="20" height="2" fill={DRUM_COLORS[1]} />
        <rect x="79" y="38" width="2" height="12" fill="#777" />
      </g>
      {/* toms */}
      <rect x="40" y="18" width="16" height="10" fill="#3a1f5c" /><rect x="40" y="18" width="16" height="2" fill="#bbb" />
      <rect x="60" y="18" width="14" height="9" fill="#3a1f5c" /><rect x="60" y="18" width="14" height="2" fill="#bbb" />
      {/* kick */}
      <g style={{ filter: glow(0) }}>
        <rect x="36" y={lit[0] ? 27 : 28} width="34" height="24" fill="#3a1f5c" />
        <rect x="40" y={lit[0] ? 31 : 32} width="26" height="16" fill={lit[0] ? DRUM_COLORS[0] : "#1e1030"} />
        <rect x="47" y={lit[0] ? 37 : 38} width="12" height="4" fill="#f2c230" />
      </g>
      <rect x="0" y="52" width="120" height="4" fill="#1d1838" />
    </svg>
  );
}
