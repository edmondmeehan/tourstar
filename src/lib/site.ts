// Website visibility. On the web the game lives at /play and stays hidden behind a "coming soon"
// screen until an admin flips Admin → Admins → Website → "Open the game to everyone".
// Admins can always play. The iPhone/Android apps are never affected.
import { create } from "zustand";
import { supabase } from "./cloud";
import { isNative } from "./native";

/** Path prefix for the game on the web. Empty in the native apps and the single-file preview. */
export const WEB_BASE = isNative || import.meta.env.VITE_ROUTER === "memory" ? "" : "/play";

interface Site { webPublic: boolean; loaded: boolean; /** Raffles shown to players (Admin → Store & money → Raffles). */ raffles: boolean }
export const useSite = create<Site>(() => ({ webPublic: false, loaded: false, raffles: false }));

export async function refreshSite() {
  if (!supabase) return useSite.setState({ webPublic: true, loaded: true });
  try {
    const { data } = await supabase.from("app_public_config").select("key, value").in("key", ["web_app_public", "raffles_enabled"]);
    const m = Object.fromEntries((data ?? []).map((r) => [r.key, String(r.value)]));
    useSite.setState({ webPublic: m.web_app_public === "true", raffles: m.raffles_enabled === "true", loaded: true });
  } catch {
    useSite.setState({ webPublic: false, loaded: true }); // offline: stay hidden
  }
}

/** Paths anyone can open while the web game is hidden (so the team can sign in). */
/** Shown on loading screens, the title screen, account, sign-in and admin. */
export const COPYRIGHT = "Copyright © 2026 TourStar, LLC";

export const OPEN_PATHS = ["/login", "/auth/callback", "/reset-password", "/admin"];
