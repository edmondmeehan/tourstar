// Drum School host ("corner"): when switched on in Admin → Partners & venues, Drum School becomes a
// licensed artist's corner (title, photo, bio, their tips on each lesson, a sign-off on great runs).
// Stored as JSON in app_public_config.drum_corner, which players can read.
import { create } from "zustand";
import { supabase } from "./cloud";

export interface DrumCorner {
  enabled: boolean;
  /** Page and menu title, e.g. "Questlove's Corner". */
  title: string;
  /** Host name as players see it, e.g. "Questlove". */
  host: string;
  tagline: string;
  bio: string;
  /** Licensed photo (https). Empty = drum emoji. */
  photo_url: string;
  /** A short quote shown under the bio. */
  quote: string;
  /** Shown after an A or S lesson. */
  sign_off: string;
  link_url: string;
  link_label: string;
  /** Host's own tip per lesson id (falls back to the built-in tip). */
  tips: Record<string, string>;
  /** Partner this is licensed through (admin only, for the license check). */
  partner_id: string | null;
  /** Corner switches itself off after this date (the license end), YYYY-MM-DD. */
  ends_on: string | null;
}

export const BLANK_CORNER: DrumCorner = {
  enabled: false, title: "", host: "", tagline: "", bio: "", photo_url: "", quote: "", sign_off: "",
  link_url: "", link_label: "", tips: {}, partner_id: null, ends_on: null,
};

const https = (u: unknown) => (typeof u === "string" && /^https:\/\/\S+$/i.test(u.trim()) ? u.trim() : "");
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export function parseCorner(raw: unknown): DrumCorner {
  let v: Record<string, unknown> = {};
  try { v = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>) ?? {}; } catch { v = {}; }
  const tips: Record<string, string> = {};
  if (v.tips && typeof v.tips === "object") for (const [k, t] of Object.entries(v.tips as Record<string, unknown>)) { const s = str(t, 240); if (s) tips[k.slice(0, 40)] = s; }
  return {
    enabled: v.enabled === true,
    title: str(v.title, 40), host: str(v.host, 40), tagline: str(v.tagline, 120), bio: str(v.bio, 600),
    photo_url: https(v.photo_url), quote: str(v.quote, 200), sign_off: str(v.sign_off, 160),
    link_url: https(v.link_url), link_label: str(v.link_label, 40), tips,
    partner_id: typeof v.partner_id === "string" ? v.partner_id : null,
    ends_on: typeof v.ends_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.ends_on) ? v.ends_on : null,
  };
}

/** On, named, and inside the license window. */
export const cornerLive = (c: DrumCorner, today = new Date().toISOString().slice(0, 10)) =>
  c.enabled && !!c.host && !!c.title && (!c.ends_on || c.ends_on >= today);

export const useCorner = create<{ corner: DrumCorner; loaded: boolean }>(() => ({ corner: BLANK_CORNER, loaded: false }));

export async function loadCorner() {
  if (!supabase) { useCorner.setState({ loaded: true }); return; }
  const { data } = await supabase.from("app_public_config").select("value").eq("key", "drum_corner").maybeSingle();
  useCorner.setState({ corner: parseCorner(data?.value ?? null), loaded: true });
}

/** The live corner, or null. */
export function useLiveCorner() {
  const corner = useCorner((s) => s.corner);
  return cornerLive(corner) ? corner : null;
}
