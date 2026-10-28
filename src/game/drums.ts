// Drum School: real grooves on a three-piece kit (kick, snare, hi-hat). Each lesson is a one-bar
// pattern in 16th notes, looped. Passing lessons with an A or S earns "chops", a small bonus to
// the playing score at every show. Patterns are generic grooves, not copies of any recording.
import type { ChartNote, Medley } from "../lib/synth";
import type { Grade } from "./setlist";

export interface Lesson {
  id: string;
  name: string;
  emoji: string;
  level: number;
  bpm: number;
  bars: number;
  /** 16 characters each, "x" = hit. */
  kick: string; snare: string; hat: string;
  style: string;
  tip: string;
}

export const LESSONS: Lesson[] = [
  { id: "first-beat", name: "First Beat", emoji: "🥁", level: 1, bpm: 80, bars: 6,
    kick: "x.......x.......", snare: "....x.......x...", hat: "................", style: "Rock basics",
    tip: "Count out loud: 1, 2, 3, 4. Kick on 1 and 3, snare on 2 and 4. That backbeat is under most songs you know." },
  { id: "hats-on", name: "Hats On", emoji: "🎩", level: 1, bpm: 88, bars: 6,
    kick: "x.......x.......", snare: "....x.......x...", hat: "..x...x...x...x.", style: "Pop groove",
    tip: "The hi-hat keeps time between the big hits. Play it light and even, like a clock ticking." },
  { id: "four-floor", name: "Four on the Floor", emoji: "🪩", level: 2, bpm: 116, bars: 8,
    kick: "x...x...x...x...", snare: "....x.......x...", hat: "..x...x...x...x.", style: "Disco & house",
    tip: "Kick on every beat, hat on every 'and'. It's the engine of the dance floor: steady beats a flashy fill." },
  { id: "boom-bap", name: "Boom Bap", emoji: "🎙️", level: 3, bpm: 90, bars: 8,
    kick: "x.......x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", style: "Hip-hop",
    tip: "Hip-hop sits a hair behind the beat. Stay relaxed, let the snare crack, and never rush the kick." },
  { id: "funk-ghost", name: "Ghost Notes", emoji: "👻", level: 4, bpm: 98, bars: 8,
    kick: "x..x......x..x..", snare: "....x..x.x..x...", hat: "x.x.x.x.x.x.x.x.", style: "Funk",
    tip: "Funk lives in the space between notes. Those quiet extra snare taps are called ghost notes: felt more than heard." },
  { id: "breakbeat", name: "The Break", emoji: "💿", level: 5, bpm: 112, bars: 8,
    kick: "x.x.......xx....", snare: "....x..x.x..x..x", hat: "x.x.x.x.x.x.x.x.", style: "Breakbeat",
    tip: "Producers built whole genres by looping a few bars of a drummer playing like this on an old record." },
  { id: "pocket", name: "In the Pocket", emoji: "🧈", level: 6, bpm: 94, bars: 8,
    kick: "x......x..x.....", snare: "....x.......x...", hat: "x.xxx.x.x.xxx.x.", style: "Neo-soul",
    tip: "'In the pocket' means the whole band can lean on your time. Lock in with the bass player and make it feel good." },
];

export const lessonById = (id?: string | null) => LESSONS.find((l) => l.id === id);

export const DRUM_LANES = ["KICK", "SNARE", "HAT"];
export const DRUM_COLORS = ["#ff9f1c", "#2ec4b6", "#f2c230"];
export const LESSON_ENERGY = 4;
/** Rewarded lessons per day (practice is unlimited and free). */
export const LESSONS_PER_DAY = 5;
/** Each lesson passed with an A or S adds this much to the show playing score, up to the cap. */
export const CHOPS_PER_LESSON = 2;
export const CHOPS_CAP = 10;

/** Timing in seconds for one lesson. The count-in is four beats. */
export function lessonTiming(l: Lesson) {
  const beat = 60 / l.bpm;
  return { beat, step: beat / 4, intro: beat * 4 };
}

/** Build the tap chart. Medley.stepSec is an 8th note so the highway's count-in counts beats. */
export function lessonChart(l: Lesson): Medley {
  const { beat, step, intro } = lessonTiming(l);
  const notes: ChartNote[] = [];
  for (let bar = 0; bar < l.bars; bar++) {
    for (let i = 0; i < 16; i++) {
      const t = intro + (bar * 16 + i) * step;
      ([l.kick, l.snare, l.hat] as const).forEach((p, lane) => {
        if (p[i] === "x") notes.push({ t, lane: lane as 0 | 1 | 2, song: 0 });
      });
    }
  }
  const durationSec = intro + l.bars * 4 * beat;
  return { stepSec: beat / 2, stepsPerSong: l.bars * 16, durationSec, songStarts: [intro], notes };
}

export function drumGrade(accuracy: number): Grade {
  return accuracy >= 0.93 ? "S" : accuracy >= 0.82 ? "A" : accuracy >= 0.65 ? "B" : accuracy >= 0.45 ? "C" : "D";
}
export const GRADE_ORDER: Grade[] = ["D", "C", "B", "A", "S"];
export const betterGrade = (a: Grade | undefined, b: Grade) => (!a || GRADE_ORDER.indexOf(b) > GRADE_ORDER.indexOf(a) ? b : a);

/** Bonus % to the show playing score from passed lessons. */
export function drumChops(best: Record<string, Grade> | undefined) {
  const passed = Object.values(best ?? {}).filter((g) => g === "A" || g === "S").length;
  return Math.min(CHOPS_CAP, passed * CHOPS_PER_LESSON);
}
