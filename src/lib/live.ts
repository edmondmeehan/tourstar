// Live-ops: analytics, remote balance config, announcements and admin-triggered events/gifts.
// Everything degrades silently when offline or when Supabase isn't configured.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Capacitor } from "@capacitor/core";
import { supabase, useCloud } from "./cloud";
import { gameStorage, isNative } from "./native";
import { sanitizeConfig, useConfig } from "../game/config";
import { useGame } from "../game/store";
import { useMembership } from "../game/settings";
import type { Delta } from "../game/types";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  style: "banner" | "popup";
  cta_label: string | null;
  cta_route: string | null;
}

interface LiveState {
  deviceId: string;
  firstOpenSent: boolean;
  seenBroadcasts: string[];
  dismissedAnnouncements: string[];
  announcements: Announcement[];
  set: (p: Partial<LiveState>) => void;
}

const newDeviceId = () => "d_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

export const useLive = create<LiveState>()(
  persist(
    (set) => ({
      deviceId: newDeviceId(),
      firstOpenSent: false,
      seenBroadcasts: [],
      dismissedAnnouncements: [],
      announcements: [],
      set: (p) => set(p),
    }),
    {
      name: "tourstar-live",
      storage: createJSONStorage(() => gameStorage),
      partialize: (s) => ({ deviceId: s.deviceId, firstOpenSent: s.firstOpenSent, seenBroadcasts: s.seenBroadcasts.slice(-200), dismissedAnnouncements: s.dismissedAnnouncements.slice(-200) }),
    },
  ),
);

export function dismissAnnouncement(id: string) {
  const s = useLive.getState();
  s.set({ dismissedAnnouncements: [...s.dismissedAnnouncements, id] });
}

// ---------------------------------------------------------------- analytics

const platform = (): "web" | "ios" | "android" => (isNative ? (Capacitor.getPlatform() as "ios" | "android") : "web");
let queue: { name: string; props: Record<string, unknown>; created_at: string }[] = [];

export function track(name: string, props: Record<string, unknown> = {}) {
  if (!supabase) return;
  queue.push({ name, props, created_at: new Date().toISOString() });
  if (queue.length > 200) queue = queue.slice(-200);
}

async function flush() {
  if (!supabase || !queue.length) return;
  const batch = queue;
  queue = [];
  const userId = useCloud.getState().session?.user.id ?? null;
  const { deviceId } = useLive.getState();
  const { error } = await supabase.from("analytics_events").insert(
    batch.map((e) => ({ ...e, device_id: deviceId, user_id: userId, platform: platform() })),
  );
  if (error) queue = [...batch, ...queue].slice(-200); // retry next time
}

function trafficSource() {
  if (isNative) return Capacitor.getPlatform() === "ios" ? "app_store" : "play_store";
  try {
    const p = new URLSearchParams(window.location.search);
    const utm = p.get("utm_source") || p.get("ref") || p.get("source");
    if (utm) return utm.toLowerCase().slice(0, 40);
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (host && host !== window.location.hostname) return host.slice(0, 40);
    }
  } catch { /* ignore */ }
  return "direct";
}

/** Derive gameplay events from state changes so game code doesn't need tracking calls everywhere. */
function watchGameplay() {
  useGame.subscribe((s, p) => {
    const c = s.career, o = p.career;
    if (!c) return;
    if (!o || o.id !== c.id) {
      if (c.log.length <= 2) track("career_created", { genre: c.genre, persona: c.persona, theme_song: c.songs.length > 0 });
      return;
    }
    if (c.totals.gigs > o.totals.gigs) {
      const last = c.log.find((l) => l.type === "gig");
      track("gig", { level: c.peakLevel, sellout: !!last?.text.includes("SOLD OUT"), label: c.labelId, grade: last?.text.match(/grade (\w)/)?.[1] ?? null });
    }
    if (c.releases.length > o.releases.length) track("release", { kind: c.releases[0].kind, quality: c.releases[0].quality, song: !!c.releases[0].songId });
    if (c.peakLevel > o.peakLevel) track("level_up", { level: c.peakLevel, week: c.week, days: Math.round(((Date.now() - c.createdAt) / 86_400_000) * 100) / 100, gigs: c.totals.gigs, fame: c.stats.fame });
    if (c.totals.scandals > o.totals.scandals) track("lockout", { kind: c.lockout?.kind });
    if (c.daily.streak !== o.daily.streak) track("daily_claim", { streak: c.daily.streak });
  });
  useMembership.subscribe((s, p) => {
    if (s.purchases.length > p.purchases.length) track("premium_purchase", { sku: s.purchases[0].sku, price: s.purchases[0].price, simulated: s.purchases[0].simulated });
  });
  useCloud.subscribe((s, p) => {
    if (s.session && !p.session) track("sign_in", { provider: s.session.user.app_metadata?.provider ?? "email" });
  });
}

// ---------------------------------------------------------------- config / announcements / broadcasts

async function refresh() {
  if (!supabase) return;
  const now = new Date().toISOString();
  const [cfgRes, annRes, bcRes] = await Promise.all([
    supabase.from("game_config").select("data").eq("id", 1).maybeSingle(),
    supabase.from("announcements").select("id,title,body,style,cta_label,cta_route,active,starts_at,ends_at").eq("active", true).lte("starts_at", now).order("created_at", { ascending: false }).limit(5),
    supabase.from("broadcasts").select("id,kind,event_id,gift,message,expires_at,active").eq("active", true).gt("expires_at", now).order("created_at", { ascending: true }).limit(10),
  ]);
  if (cfgRes.data) useConfig.getState().setConfig(sanitizeConfig(cfgRes.data.data));
  if (annRes.data) {
    const live = annRes.data.filter((a) => !a.ends_at || a.ends_at > now) as Announcement[];
    useLive.getState().set({ announcements: live });
  }
  if (bcRes.data) applyBroadcasts(bcRes.data as { id: string; kind: "event" | "gift"; event_id: string | null; gift: Delta | null; message: string | null }[]);
}

function applyBroadcasts(list: { id: string; kind: "event" | "gift"; event_id: string | null; gift: Delta | null; message: string | null }[]) {
  const live = useLive.getState();
  const game = useGame.getState();
  if (!game.career) return; // deliver once they have a career
  const seen = new Set(live.seenBroadcasts);
  for (const b of list) {
    if (seen.has(b.id)) continue;
    if (b.kind === "gift" && b.gift) {
      game.receiveGift(b.gift, b.message ?? "");
      seen.add(b.id);
    } else if (b.kind === "event" && b.event_id) {
      if (game.receiveEvent(b.event_id)) seen.add(b.id);
      else continue; // busy right now; try again next refresh
    }
    track("broadcast_received", { id: b.id, kind: b.kind });
    break; // one at a time, so overlays don't stack
  }
  live.set({ seenBroadcasts: [...seen] });
}

let started = false;
export function startLive() {
  if (started || !supabase) return;
  started = true;
  const live = useLive.getState();
  if (!live.firstOpenSent) {
    track("first_open", { source: trafficSource(), lang: navigator.language });
    live.set({ firstOpenSent: true });
  }
  track("session_start", { source: trafficSource() });
  watchGameplay();
  void refresh();
  window.setInterval(() => void refresh(), 5 * 60_000);
  window.setInterval(() => void flush(), 10_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
    else void refresh();
  });
  window.setTimeout(() => void flush(), 3000);
}
