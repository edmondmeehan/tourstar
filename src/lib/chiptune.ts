// Game-side wrappers around the synth engine: use the shared AudioContext and the player's volume setting.
import type { GenreId } from "../game/types";
import { audio, masterVolume } from "./fx";
import { playMedleyWith, playSongWith, type Medley, type MedleyHandle, type PlayHandle } from "./synth";

export * from "./synth";

export function playSong(seed: number, genre: GenreId, onEnd?: () => void): PlayHandle {
  return playSongWith(audio(), masterVolume(), seed, genre, onEnd);
}

export function playMedley(seeds: number[], genre: GenreId, m: Medley, intro = 2): MedleyHandle {
  let a: AudioContext | null = null;
  try { a = audio(); } catch { a = null; }
  return playMedleyWith(a, masterVolume(), seeds, genre, m, intro);
}
