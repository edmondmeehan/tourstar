// Website visibility. On the web the game lives at /play and stays hidden behind a "coming soon"
// screen until an admin flips Admin → Admins → Website → "Open the game to everyone".
// Admins can always play. The iPhone/Android apps are never affected.
import { create } from "zustand";
import { supabase } from "./cloud";
import { isNative } from "./native";

/** Path prefix for the game on the web. Empty in the native apps and the single-file preview. */
export const WEB_BASE = isNative || import.meta.env.VITE_ROUTER === "memory" ? "" : "/play";

interface Site { webPublic: boolean; loaded: boolean }
export const useSite = create<Site>(() => ({ webPublic: false, loaded: false }));

export async function refreshSite() {
  if (!supabase) return useSite.setState({ webPublic: true, loaded: true });
  try {
    const { data } = await supabase.from("app_public_config").select("value").eq("key", "web_app_public").maybeSingle();
    useSite.setState({ webPublic: data?.value === "true", loaded: true });
  } catch {
    useSite.setState({ webPublic: false, loaded: true }); // offline: stay hidden
  }
}

/** Paths anyone can open while the web game is hidden (so the team can sign in). */
export const OPEN_PATHS = ["/login", "/auth/callback", "/reset-password", "/admin"];
