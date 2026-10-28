// TourStar Radio: stations of real AI-studio songs recorded by every player, by genre.
// Likes help pick songs for the TourStar Monthly; three reports take a song off the air until an admin reviews it.
import { create } from "zustand";
import { playClip, type ClipHandle } from "./ai";
import { useConcert } from "../concert/useConcert";
import { supabase } from "./cloud";
import { useLive } from "./live";

export interface RadioSong { id: string; path: string; genre: string; title: string; artist: string; likes: number; liked: boolean }

export const songUrl = (path: string) => supabase!.storage.from("ai-audio").getPublicUrl(path).data.publicUrl;
const device = () => useLive.getState().deviceId;

export async function loadStation(station: string): Promise<RadioSong[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("radio_station", { p_station: station, p_device: device() });
  if (error) throw error;
  return (data ?? []) as RadioSong[];
}

export async function toggleLike(id: string): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("radio_like", { p_gen: id, p_device: device() });
  return error ? null : Number(data);
}

export async function reportSong(id: string, reason: string) {
  if (!supabase) return false;
  const { error } = await supabase.rpc("radio_report", { p_gen: id, p_device: device(), p_reason: reason });
  return !error;
}

// ---------------------------------------------------------------- player (keeps playing across pages)


interface RadioState {
  station: string | null;
  queue: RadioSong[] | null;
  idx: number;
  playing: boolean;
}
export const useRadio = create<RadioState>(() => ({ station: null, queue: null, idx: 0, playing: false }));
let handle: ClipHandle | null = null;

export async function tune(station: string) {
  stopRadio();
  useRadio.setState({ station, queue: null, idx: 0 });
  try {
    const queue = await loadStation(station);
    if (useRadio.getState().station === station) useRadio.setState({ queue });
  } catch (e) {
    useRadio.setState({ queue: [] });
    throw e;
  }
}

export function playAt(i: number) {
  const { queue } = useRadio.getState();
  if (!queue?.length) return;
  handle?.stop();
  const n = ((i % queue.length) + queue.length) % queue.length;
  useRadio.setState({ idx: n, playing: true });
  const h = playClip(songUrl(queue[n].path), { onEnd: () => { if (handle === h) playAt(n + 1); } });
  handle = h;
}

/** Stop the radio (keeps the station and position so it can resume). */
export function stopRadio() {
  const h = handle;
  handle = null;
  h?.stop();
  useRadio.setState({ playing: false });
}

/** Turn the radio off completely (hides the mini player). */
export function closeRadio() {
  stopRadio();
  useRadio.setState({ station: null, queue: null, idx: 0 });
}

export function patchSong(id: string, patch: Partial<RadioSong>) {
  useRadio.setState((s) => ({ queue: s.queue?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? null }));
}
export function dropSong(id: string) {
  const { queue, idx } = useRadio.getState();
  if (!queue) return;
  const i = queue.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (i === idx) stopRadio();
  useRadio.setState({ queue: queue.filter((x) => x.id !== id), idx: i < idx ? idx - 1 : Math.min(idx, queue.length - 2) });
}

// A show takes over the speakers.
useConcert.subscribe((s, p) => { if (s.show && !p.show) stopRadio(); });
