// Usage and crash tracking (no third-party SDK): small batches of named events go to Supabase
// (track_events), keyed by a random device id. Errors are captured automatically. Admin → Engagement
// shows the funnel (did new players reach their first show?), 1- and 7-day return rates, and crashes.
// No personal data: event names plus a few numbers. Signed-in players are linked to their account.
import { supabase, useCloud } from "./cloud";
import { useGame } from "../game/store";
import { isNative } from "./native";

type Ev = { name: string; props?: Record<string, unknown>; t: number };
const KEY = "ts_device";
let queue: Ev[] = [];
let started = false;
let errorsSent = 0;
const seenErrors = new Set<string>();

function deviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = `d_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; localStorage.setItem(KEY, id); }
    return id;
  } catch { return "d_nostorage00"; }
}

/** Record something that happened. Safe to call anywhere, any time. */
export function track(name: string, props?: Record<string, unknown>) {
  if (!/^[a-z0-9_]{1,40}$/.test(name)) return;
  queue.push({ name, props, t: Date.now() });
  if (queue.length > 200) queue = queue.slice(-200);
  if (queue.length >= 20) void flush();
}

async function flush() {
  if (!supabase || !queue.length) return;
  const batch = queue.splice(0, 50);
  const now = Date.now();
  const events = batch.map((e) => ({ name: e.name, props: e.props ?? {}, ago: Math.max(0, Math.round((now - e.t) / 1000)) }));
  const { error } = await supabase.rpc("track_events", { p_device: deviceId(), p_events: events });
  if (error && !/function|does not exist|schema cache/i.test(error.message)) queue.unshift(...batch.slice(0, 50)); // retry later, unless the SQL isn't installed yet
}

function reportError(msg: string, where: string) {
  const key = msg.slice(0, 120);
  if (!msg || seenErrors.has(key) || errorsSent >= 10) return;
  if (/ResizeObserver loop|Script error\.?$/i.test(msg)) return; // browser noise
  seenErrors.add(key);
  errorsSent++;
  track("error", { msg: msg.slice(0, 300), where: where.slice(0, 200), v: __BUILD__, path: location.pathname, native: isNative });
  void flush();
}

export function startAnalytics() {
  if (started) return;
  started = true;
  window.addEventListener("error", (e) => reportError(String(e.message || e.error?.message || ""), `${(e.filename || "").split("/").pop()}:${e.lineno}:${e.colno}`));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    const msg = typeof r === "string" ? r : r?.message ?? "";
    if (/Failed to fetch|NetworkError|Load failed|network connection/i.test(msg)) return; // offline, not a bug
    reportError(msg, typeof r === "object" ? String(r?.stack ?? "").split("\n")[1]?.trim() ?? "promise" : "promise");
  });
  track("app_open", { v: __BUILD__, native: isNative, signed_in: !!useCloud.getState().session });

  // Milestones, read from the save so every path (tutorial, skip, replays) is counted the same way.
  useGame.subscribe((s, p) => {
    const c = s.career, o = p.career;
    if (!c) return;
    if (!o || o.id !== c.id) { if (c.week === 1 && c.totals.gigs === 0 && c.createdAt > Date.now() - 60_000) track("career_created", { genre: c.genre, persona: c.persona }); return; }
    const st = c.tutorial?.step, ost = o.tutorial?.step;
    if (st !== undefined && st !== ost) track("tutorial", { step: st });
    if (o.tutorial && !c.tutorial) track((ost ?? 0) >= 6 ? "tutorial_done" : "tutorial_skip", { step: ost ?? 0 });
    if (c.totals.gigs > o.totals.gigs) track("show_done", { n: c.totals.gigs, level: c.peakLevel });
    if (c.releases.length > o.releases.length) track("release_done", { n: c.releases.length });
    if (c.peakLevel > o.peakLevel) track("level_up", { level: c.peakLevel });
  });
  useCloud.subscribe((s, p) => { if (s.session && !p.session) track("signed_in"); });

  window.setInterval(() => void flush(), 20_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flush(); });
}
