// Offline mode: knows when the device has no connection, keeps AI songs and Mo's voice clips on the
// phone so they play without Wi-Fi, and syncs everything when the connection comes back.
import { create } from "zustand";
import { toast } from "../components/ui";

export const useOnline = create<{ online: boolean }>(() => ({ online: typeof navigator === "undefined" ? true : navigator.onLine !== false }));

/** Pages that only work with a connection. Others (shows, studio, Drum School, stats, look, the Shop) work offline. */
export const ONLINE_ONLY: Record<string, string> = {
  "/rivals": "Leagues and leaderboards",
  "/friends": "Friends and the festival bill",
  "/press": "The Press",
  "/radio": "TourStar Radio",
  "/distribute": "TourStar Monthly",
  "/presales": "Presale codes",
  "/premium": "VIP and Gold purchases",
};

const CACHE = "ts-audio-v1";
const hasCache = () => typeof caches !== "undefined";

/** Fetch an audio file, from the phone's cache when it's there; saves it for next time. */
export async function cachedFetch(url: string): Promise<Response> {
  if (!hasCache() || !/^https?:/i.test(url)) return fetch(url);
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return hit;
    const res = await fetch(url);
    if (res.ok) void cache.put(url, res.clone()).catch(() => { /* storage full: just stream */ });
    return res;
  } catch {
    return fetch(url);
  }
}

/** A playable URL for an audio file: a local copy when cached (works offline), otherwise the original. */
export async function playableUrl(url: string): Promise<string> {
  if (!hasCache() || !/^https?:/i.test(url)) return url;
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return URL.createObjectURL(await hit.blob());
    if (useOnline.getState().online) void cache.add(url).catch(() => { /* fine */ });
  } catch { /* fall back to streaming */ }
  return url;
}

/** Download songs in the background (while online) so they're ready for the next time there's no signal. */
export async function warmAudio(urls: string[]) {
  if (!hasCache() || !useOnline.getState().online) return;
  try {
    const cache = await caches.open(CACHE);
    for (const u of urls.slice(0, 40)) {
      if (!/^https?:/i.test(u) || (await cache.match(u))) continue;
      await cache.add(u).catch(() => { /* skip this one */ });
    }
  } catch { /* storage unavailable */ }
}

let started = false;
export function startOffline(onBack: () => void) {
  if (started || typeof window === "undefined") return;
  started = true;
  const set = (online: boolean) => {
    const was = useOnline.getState().online;
    useOnline.setState({ online });
    if (online && !was) {
      toast({ ok: true, title: "You're back online", message: "Syncing your career and points now." });
      onBack();
    }
    if (!online && was) toast({ ok: true, title: "Offline mode", message: "No connection. Shows, the studio and Drum School still work, and everything syncs when you're back." });
  };
  window.addEventListener("online", () => set(true));
  window.addEventListener("offline", () => set(false));
}
