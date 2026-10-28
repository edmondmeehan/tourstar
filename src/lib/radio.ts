// TourStar Radio: stations of real AI-studio songs recorded by every player, by genre.
// Likes help pick songs for the TourStar Monthly; three reports take a song off the air until an admin reviews it.
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
