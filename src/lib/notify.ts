// Reminder notifications, scheduled on the device (no server or push certificates needed):
// energy full, royalties full, streak about to break, and new daily quests.
// Rescheduled whenever the app goes to the background. Native only; a no-op on the web.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { gameStorage, isNative } from "./native";
import { useGame } from "../game/store";
import { useMembership } from "../game/settings";
import { cfg } from "../game/config";
import { MAX_ENERGY } from "../game/data";
import { todayKey } from "../game/engine";
import { ROYALTY_CAP_HOURS } from "../game/quests";

type Status = "unknown" | "granted" | "denied";
export const useNotify = create<{ enabled: boolean; status: Status; asked: boolean; set: (p: Partial<{ enabled: boolean; status: Status; asked: boolean }>) => void }>()(
  persist(
    (set) => ({ enabled: true, status: "unknown", asked: false, set: (p) => set(p) }),
    { name: "tourstar-notify", storage: createJSONStorage(() => gameStorage), partialize: (s) => ({ enabled: s.enabled, status: s.status, asked: s.asked }) },
  ),
);

const IDS = { energy: 101, royalties: 102, streak: 103, quests: 104 };

/** Ask for permission once, at a good moment (after the first show), never on launch. */
export async function askNotificationPermission() {
  if (!isNative) return false;
  const st = useNotify.getState();
  if (st.asked && st.status !== "unknown") return st.status === "granted";
  try {
    const res = await LocalNotifications.requestPermissions();
    const status: Status = res.display === "granted" ? "granted" : "denied";
    useNotify.getState().set({ status, asked: true });
    if (status === "granted") void scheduleReminders();
    return status === "granted";
  } catch {
    return false;
  }
}

function at(hour: number, minute: number, dayOffset: number) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export async function scheduleReminders() {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: Object.values(IDS).map((id) => ({ id })) });
    const { enabled, status } = useNotify.getState();
    const c = useGame.getState().career;
    if (!enabled || status !== "granted" || !c || c.tutorial) return;
    const now = Date.now();
    const list: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean } }[] = [];
    const soon = (ms: number) => ms > now + 5 * 60_000; // nothing in the next 5 minutes

    // Energy full
    if (c.stats.energy < MAX_ENERGY) {
      const per = cfg().energyRegenSeconds * 1000 * (useMembership.getState().removeTimers ? 0.5 : 1);
      const full = c.lastEnergyTick + (MAX_ENERGY - c.stats.energy) * per;
      if (soon(full)) list.push({ id: IDS.energy, title: "⚡ Energy full", body: `${c.name} is rested and ready. The crowd is waiting. Book a show!`, schedule: { at: new Date(full), allowWhileIdle: true } });
    }
    // Royalties full
    if (c.releases.length && c.royaltiesAt) {
      const full = c.royaltiesAt + ROYALTY_CAP_HOURS * 36e5;
      if (soon(full)) list.push({ id: IDS.royalties, title: "💰 Royalties maxed out", body: "Your songs earned all they can hold. Collect them to keep the money coming.", schedule: { at: new Date(full), allowWhileIdle: true } });
    }
    // Streak: 7pm today if not claimed yet (and the streak is worth saving), otherwise 7pm tomorrow.
    if (c.daily.streak >= 2) {
      const claimedToday = c.daily.lastClaim === todayKey();
      const when = claimedToday ? at(19, 0, 1) : at(19, 0, 0);
      if (soon(when.getTime())) list.push({ id: IDS.streak, title: `🔥 Don't lose your ${c.daily.streak + (claimedToday ? 1 : 0)}-day streak`, body: "Claim today's daily reward before midnight.", schedule: { at: when, allowWhileIdle: true } });
    }
    // New quests tomorrow morning
    list.push({ id: IDS.quests, title: "🎯 New quests are in", body: "Three fresh quests and bonus points are waiting.", schedule: { at: at(10, 0, 1), allowWhileIdle: true } });

    await LocalNotifications.schedule({ notifications: list });
  } catch {
    /* notifications are best-effort */
  }
}

/** Call once at startup. */
export function startNotifications() {
  if (!isNative) return;
  void LocalNotifications.checkPermissions().then((p) => {
    useNotify.getState().set({ status: p.display === "granted" ? "granted" : p.display === "denied" ? "denied" : useNotify.getState().status });
  }).catch(() => {});
  // Reschedule whenever the player leaves the app; clear stale ones when they come back.
  void App.addListener("appStateChange", ({ isActive }) => { if (!isActive) void scheduleReminders(); });
  // Ask after the first finished show (not at launch).
  useGame.subscribe((s, prev) => {
    if ((s.career?.totals.gigs ?? 0) >= 1 && (prev.career?.totals.gigs ?? 0) === 0) window.setTimeout(() => void askNotificationPermission(), 1500);
  });
}
