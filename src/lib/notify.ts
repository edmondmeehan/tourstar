// Reminder notifications, scheduled on the device (no server or push certificates needed):
// energy full, royalties full, streak about to break, and new daily quests.
// Rescheduled whenever the app goes to the background. Native only; a no-op on the web.
import { enablePush } from "./push";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { gameStorage, isNative } from "./native";
import { useGame } from "../game/store";
import { useMembership } from "../game/settings";
import { cfg } from "../game/config";
import { MAX_ENERGY, TOURS } from "../game/data";
import { nextChallenge } from "../game/economy";
import { levelFor } from "../game/engine";
import { todayKey } from "../game/engine";
import { ROYALTY_CAP_HOURS } from "../game/quests";
import { eventLive, useTourEvent } from "./tourEvent";
import { useLeague } from "./social";

type Status = "unknown" | "granted" | "denied";
export const useNotify = create<{ enabled: boolean; status: Status; asked: boolean; set: (p: Partial<{ enabled: boolean; status: Status; asked: boolean }>) => void }>()(
  persist(
    (set) => ({ enabled: true, status: "unknown", asked: false, set: (p) => set(p) }),
    { name: "tourstar-notify", storage: createJSONStorage(() => gameStorage), partialize: (s) => ({ enabled: s.enabled, status: s.status, asked: s.asked }) },
  ),
);

const IDS = { energy: 101, royalties: 102, streak: 103, quests: 104, miss3: 105, miss7: 106, drums: 107, offer: 108, event: 109, league: 110, goal: 111 };

/** Ask for permission once, at a good moment (after the first show), never on launch. */
export async function askNotificationPermission() {
  if (!isNative) return false;
  const st = useNotify.getState();
  if (st.asked && st.status !== "unknown") return st.status === "granted";
  try {
    const res = await LocalNotifications.requestPermissions();
    const status: Status = res.display === "granted" ? "granted" : "denied";
    useNotify.getState().set({ status, asked: true });
    if (status === "granted") { void scheduleReminders(); void enablePush(); }
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
    // Drum School: a nudge in the early evening the day after, if they've started lessons but haven't maxed chops.
    if (c.drums && Object.keys(c.drums.best ?? {}).length > 0) {
      list.push({ id: IDS.drums, title: "🥁 Your sticks are getting cold", body: "One Drum School lesson today keeps your chops sharp for every show.", schedule: { at: at(17, 30, 2), allowWhileIdle: true } });
    }
    // Promoter offer about to expire (45 minutes before).
    if (c.offer) {
      const when = c.offer.expires - 45 * 60_000;
      if (soon(when)) list.push({ id: IDS.offer, title: `📞 ${c.offer.venue} needs an answer`, body: `The +${c.offer.payBonus}% pay gig offer expires in 45 minutes.`, schedule: { at: new Date(when), allowWhileIdle: true } });
    }
    // Tour event ending tomorrow and the collectible isn't earned yet.
    const ev = useTourEvent.getState().event;
    if (ev && eventLive(ev) && !(c.event?.id === ev.id && c.event.claimed)) {
      const left = ev.goal - (c.event?.id === ev.id ? c.event.shows : 0);
      const when = Date.parse(ev.ends) - 20 * 36e5;
      if (left > 0 && soon(when)) list.push({ id: IDS.event, title: `${ev.emoji} ${ev.name} ends tomorrow`, body: `${left} more show${left === 1 ? "" : "s"} at ${ev.venue.name} to earn the collectible. It won't come back.`, schedule: { at: new Date(when), allowWhileIdle: true } });
    }
    // League: Sunday 6pm, if a promotion spot is close or the relegation zone is near.
    const lg = useLeague.getState().league;
    const me = lg?.rows.find((r) => r.me);
    if (lg?.joined && me) {
      const close = Date.parse(lg.resets_at);
      const sun = new Date(close - 36e5); sun.setHours(18, 0, 0, 0);
      const when = sun.getTime() < close ? sun.getTime() : close - 3 * 36e5;
      const promo = lg.up > 0 && me.rank > lg.up && me.rank <= lg.up + 3;
      const danger = lg.down > 0 && me.rank > lg.size - lg.down - 2;
      if ((promo || danger) && soon(when)) list.push({ id: IDS.league, title: promo ? "⬆️ Promotion is within reach" : "⚠️ Your league spot is at risk", body: promo ? `You're #${me.rank}. Top ${lg.up} move up when the week ends in a few hours.` : `You're #${me.rank}. The week ends in a few hours. One good show keeps you out of the drop zone.`, schedule: { at: new Date(when), allowWhileIdle: true } });
    }
    // Close to the next tour: tomorrow evening, when the challenge is a few steps from done.
    const goal = nextChallenge(c, levelFor(c.stats.fame).level, TOURS);
    if (goal && goal.left <= 5) {
      const t = TOURS.find((x) => x.id === goal.tourId)!;
      list.push({ id: IDS.goal, title: `${t.emoji} The ${t.name} is almost yours`, body: `Just ${goal.left} more to go before the promoters open the ${t.name}.`, schedule: { at: at(17, 0, 1), allowWhileIdle: true } });
    }
    // Come back: 3 and 7 days after they last left the app (replaced every time they leave again).
    list.push({ id: IDS.miss3, title: `🎤 The crowd keeps chanting "${c.name}"`, body: "Your energy is full and the next stage is open. One show keeps the hype alive.", schedule: { at: at(18, 0, 3), allowWhileIdle: true } });
    list.push({ id: IDS.miss7, title: "📰 The press is asking where you went", body: `${c.name}'s hype is fading and your rivals are booking your stages. Time for a comeback.`, schedule: { at: at(18, 0, 7), allowWhileIdle: true } });

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
