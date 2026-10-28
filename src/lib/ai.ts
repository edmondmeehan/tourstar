// AI audio (ElevenLabs, via our Supabase functions; the key never reaches the app):
//  • AI songs for releases   → functions/ai-song
//  • Mo's voice + stadium intro → functions/ai-voice
// Admins switch each on/off in /admin → AI music.
import { create } from "zustand";
import { supabase, useCloud } from "./cloud";
import { masterVolume } from "./fx";
import { useGame } from "../game/store";
import type { ReleaseKind, Song } from "../game/types";

interface AiFlags { music: boolean; voice: boolean; dailyLimit: number; vipBonus: number; minLevel: number; loaded: boolean; credits: number; vip: boolean; songsTotal: number }
export const useAiFlags = create<AiFlags>(() => ({ music: false, voice: false, dailyLimit: 3, vipBonus: 3, minLevel: 3, loaded: false, credits: 0, vip: false, songsTotal: 0 }));

/** Purchased AI Studio credits and server-side VIP status (signed-in players). */
export async function refreshPerks() {
  if (!supabase || !useCloud.getState().session) return useAiFlags.setState({ credits: 0, vip: false });
  const { data } = await supabase.rpc("my_perks");
  if (data) useAiFlags.setState({ credits: Number(data.ai_credits) || 0, vip: !!data.vip, songsTotal: Number(data.ai_songs_total) || 0 });
}

export async function refreshAiFlags() {
  if (!supabase) return;
  const { data } = await supabase.from("app_public_config").select("key, value").in("key", ["ai_music_enabled", "ai_voice_enabled", "ai_music_daily_limit", "ai_music_vip_bonus", "ai_music_min_level"]);
  if (!data) return;
  const m = Object.fromEntries(data.map((r) => [r.key, r.value as string]));
  useAiFlags.setState({ music: m.ai_music_enabled === "true", voice: m.ai_voice_enabled === "true", dailyLimit: Number(m.ai_music_daily_limit ?? 3) || 0, vipBonus: Number(m.ai_music_vip_bonus ?? 3) || 0, minLevel: Math.max(1, Math.min(7, Number(m.ai_music_min_level ?? 3) || 1)), loaded: true });
}

/**
 * Whether this player can record a real AI song at their level (the server checks the same rules):
 * one free debut recording for everyone, daily free songs from the unlock level, and VIP members or
 * players with purchased Studio credits at any level.
 */
export function aiSongAccess(peakLevel: number): { ok: boolean; why: "debut" | "level" | "vip" | "credits" | "locked"; minLevel: number } {
  const f = useAiFlags.getState();
  if (f.vip) return { ok: true, why: "vip", minLevel: f.minLevel };
  if (peakLevel >= f.minLevel) return { ok: true, why: "level", minLevel: f.minLevel };
  if (f.songsTotal === 0) return { ok: true, why: "debut", minLevel: f.minLevel };
  if (f.credits > 0) return { ok: true, why: "credits", minLevel: f.minLevel };
  return { ok: false, why: "locked", minLevel: f.minLevel };
}

/** Can this player record AI songs right now? (Needs an account: songs are tied to it and capped per day.) */
export const aiSongsAvailable = () => !!supabase && useAiFlags.getState().music && !!useCloud.getState().session;

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  if (!supabase) return { error: "Not available in this build." };
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    // The function's own message is in the response body.
    let msg = "Something went wrong.";
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* keep default */ }
    return { error: msg };
  }
  return { data: data as T };
}

/** Ask the AI studio for a real song for this release. Runs in the background; the Locker updates when it lands. */
export async function recordAiSong(song: Song, kind: ReleaseKind, persona: string): Promise<{ ok: boolean; message: string }> {
  const set = useGame.getState().setSongAudio;
  set(song.id, { ai: "pending" });
  const r = await invoke<{ url: string }>("ai-song", { songId: song.id, title: song.title, genre: song.genre, persona, kind });
  if (!r.data?.url) {
    set(song.id, { ai: "failed" });
    return { ok: false, message: `${r.error ?? "The AI studio couldn't record this one."} "${song.title}" keeps its synth version.` };
  }
  set(song.id, { ai: undefined, audioUrl: r.data.url });
  useAiFlags.setState((s) => ({ songsTotal: s.songsTotal + 1 }));
  void refreshPerks();
  return { ok: true, message: `🎧 "${song.title}" is mixed and mastered. It's in your Locker.` };
}

// ---------------------------------------------------------------- voice

const moCache = new Map<number, string>();
export const clearMoCache = () => moCache.clear();
/** Last error from the voice server, for the admin preview. */
export let lastVoiceError = "";
export async function moLineUrl(step: number, force = false) {
  if (!force && !useAiFlags.getState().voice) return null;
  if (moCache.has(step)) return moCache.get(step)!;
  const r = await invoke<{ url: string }>("ai-voice", { kind: "mo", step });
  lastVoiceError = r.error ?? "";
  if (r.data?.url) moCache.set(step, r.data.url);
  return r.data?.url ?? null;
}

/** Make sure the stadium announcer knows this artist's name (once per name; cached on the server). */
export async function ensureAnnouncer() {
  const c = useGame.getState().career;
  if (!c || !useAiFlags.getState().voice || !useCloud.getState().session) return;
  if (c.announcerFor === c.name && c.announcerUrl) return;
  const r = await invoke<{ url: string }>("ai-voice", { kind: "intro", name: c.name });
  if (r.data?.url) useGame.getState().setAnnouncer(r.data.url, c.name);
}

// ---------------------------------------------------------------- playback

export interface ClipHandle { stop: () => void; done: Promise<void> }
/** Play an audio file at the game's volume. Resolves when it ends (or fails). */
export function playClip(url: string, opts: { onEnd?: () => void; gain?: number } = {}): ClipHandle {
  const el = new Audio(url);
  el.volume = Math.max(0, Math.min(1, masterVolume() * (opts.gain ?? 1)));
  let resolve!: () => void;
  const done = new Promise<void>((r) => { resolve = r; });
  const end = () => { opts.onEnd?.(); resolve(); };
  el.addEventListener("ended", end, { once: true });
  el.addEventListener("error", end, { once: true });
  if (el.volume > 0) void el.play().catch(end); else end();
  return { stop: () => { el.pause(); el.src = ""; resolve(); }, done };
}

let started = false;
export function startAi() {
  if (started || !supabase) return;
  started = true;
  void refreshAiFlags().then(ensureAnnouncer);
  void refreshPerks();
  window.setInterval(() => void refreshAiFlags(), 5 * 60_000);
  useCloud.subscribe((s, p) => { if (s.session?.user.id !== p.session?.user.id) { void ensureAnnouncer(); void refreshPerks(); } });
  useGame.subscribe((s, p) => { if (s.career?.name && s.career.name !== p.career?.name) void ensureAnnouncer(); });
}
