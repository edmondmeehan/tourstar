import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { gameStorage } from "../lib/native";
import {
  BASE_STATS, CREW, DAILY_MILESTONES, GENRES, LABELS, MAX_ENERGY, PERSONAS,
  RELEASES, RIVALS, STORE, TOURS,
} from "./data";
import { EVENTS, type Outcome } from "./events";
import {
  applyDelta, buildChart, chartReward, crewBonuses, labelOf, levelFor, levelMult, scaleDelta,
  todayKey, uid, weekKey, yesterdayKey,
} from "./engine";
import { useMembership } from "./settings";
import { cfg } from "./config";
import type {
  Career, Celebration, CrewId, Delta, GenreId, LockoutKind, LogType, PersonaId, ReleaseKind, Song, Stats,
} from "./types";
import { songTitle } from "../lib/chiptune";
import {
  SET_SLOTS, debutChance, fanRequest, gradeFor, setlistScore, showScore, songPool, type EncoreChoice, type Grade, type PendingShow,
} from "./setlist";
import { ALL_QUESTS_BONUS, currentQuests, questLabel, royaltiesPending, type QuestKind } from "./quests";

export interface GigReport {
  tourId: string;
  tourName: string;
  crowd: number;
  capacity: number;
  sellout: boolean;
  net: number;
  pyro: boolean;
  lighting: boolean;
  grade: Grade;
  performance: number;
  setlist: number;
  encore: EncoreChoice | null;
  encoreLanded?: boolean;
  debutTitle?: string;
  playedRequest: boolean;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  delta?: Delta;
  gig?: GigReport;
  title?: string;
  /** Reward points earned by this action. */
  points?: number;
}

interface GameState {
  career: Career | null;
  celebrations: Celebration[];
  lastOutcome: { title: string; text: string; delta: Delta } | null;

  createCareer: (p: { name: string; genre: GenreId; persona: PersonaId; themeSeed?: number }) => void;
  tick: () => void;
  /** Spend energy and costs, lock in the crowd, and put the show on (the concert overlay plays it). */
  startShow: (tourId: string, setlist: string[]) => ActionResult & { show?: PendingShow };
  collectRoyalties: () => ActionResult;
  claimQuest: (index: number) => ActionResult;
  /** Tutorial: move to a step, or null to finish/skip. */
  setTutorial: (step: number | null) => void;
  /** AI studio: attach a real recording (or its pending/failed state) to a song. */
  setSongAudio: (id: string, patch: Pick<Song, "audioUrl" | "ai">) => void;
  setAnnouncer: (url: string, name: string) => void;
  /** Pay out a started show. performance is 0..1 from the rhythm game. */
  finishShow: (performance: number, encore: EncoreChoice | null) => ActionResult;
  release: (kind: ReleaseKind, title: string, withSong: boolean) => ActionResult;
  signLabel: (id: string) => ActionResult;
  leaveLabel: () => ActionResult;
  hire: (id: CrewId) => ActionResult;
  buy: (id: string) => ActionResult;
  rest: () => ActionResult;
  beef: (rivalId: string) => ActionResult;
  collab: (rivalId: string) => ActionResult;
  claimDaily: () => ActionResult;
  rename: (name: string) => ActionResult;
  resolveEvent: (choice: number) => void;
  clearOutcome: () => void;
  payBail: () => ActionResult;
  retire: () => void;
  addSong: (s: Omit<Song, "id" | "createdAt">) => Song;
  removeSong: (id: string) => void;
  setQueue: (ids: string[]) => void;
  grantCash: (n: number, why: string) => void;
  receiveGift: (gift: Delta, message: string) => void;
  receiveEvent: (eventId: string) => boolean;
  dismissCelebration: () => void;
}

const isLocked = (c: Career) => !!c.lockout && c.lockout.until > Date.now();
const lockMsg = (c: Career): ActionResult => ({ ok: false, message: c.lockout?.reason ?? "You're locked out right now." });

function newLog(c: Career, type: LogType, text: string) {
  c.log = [{ id: uid(), at: Date.now(), week: c.week, type, text }, ...c.log].slice(0, 400);
}

/** Reward points: earned only by playing, never bought. */
export const GRADE_POINTS: Record<Grade, number> = { S: 40, A: 25, B: 15, C: 8, D: 3 };
/** Points for a show or release, only for the first few each day (same cap for everyone, paid or not). */
function awardAct(c: Career, base: number) {
  const day = new Date().toISOString().slice(0, 10);
  const acts = c.pointActs?.day === day ? c.pointActs.n : 0;
  if (acts >= cfg().pointActsPerDay) return 0;
  c.pointActs = { day, n: acts + 1 };
  return award(c, base);
}

function award(c: Career, base: number) {
  const n = Math.max(0, Math.round(base * cfg().pointsMultiplier));
  c.pointsEarned = (c.pointsEarned ?? 0) + n;
  return n;
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => {
      /** Mutating helper: apply a delta with hype/level side-effects to a draft career. */
      const gain = (c: Career, raw: Delta, opts: { chart?: boolean } = {}) => {
        const b = crewBonuses(c);
        const d: Delta = { ...raw };
        if (d.hype && d.hype > 0) d.hype = Math.round(d.hype * b.hypeMult);
        const beforeLevel = levelFor(c.stats.fame).level;
        c.stats = applyDelta(c.stats, d);
        if (opts.chart !== false && ((d.fame ?? 0) > 0 || (d.hype ?? 0) > 0)) {
          c.rivals.points += Math.max(0, d.fame ?? 0) + Math.max(0, d.hype ?? 0) * 3;
        }
        const after = levelFor(c.stats.fame);
        const cel: Celebration[] = [];
        if (after.level > beforeLevel && after.level > c.peakLevel) {
          c.peakLevel = after.level;
          newLog(c, "milestone", `Leveled up to ${after.name}!`);
          const lp = award(c, 100 * after.level);
          cel.push({ id: uid(), kind: "level", title: "LEVEL UP!", subtitle: `You're now a ${after.name} · +${lp} points` });
          TOURS.filter((t) => t.level === after.level && !c.unlockedTours.includes(t.id)).forEach((t) => {
            c.unlockedTours.push(t.id);
            newLog(c, "milestone", `Unlocked the ${t.name}.`);
            cel.push({ id: uid(), kind: "tour", title: "NEW TOUR UNLOCKED", subtitle: `${t.emoji} ${t.name}` });
          });
        }
        if (cel.length) set((s) => ({ celebrations: [...s.celebrations, ...cel] }));
        // Health hitting zero forces a rehab stint.
        if (c.stats.health <= 0 && !isLocked(c)) {
          lockout(c, "rehab", 8, "You collapsed from exhaustion. Doctor's orders: rest in rehab.");
          c.stats.health = 30;
        }
        return d;
      };

      const lockout = (c: Career, kind: LockoutKind, minutes: number, reason: string, bail?: number) => {
        const half = useMembership.getState().removeTimers ? 0.5 : 1;
        c.lockout = { kind, until: Date.now() + minutes * 60_000 * half, reason, bail };
        if (kind === "dropped" && c.labelId) {
          newLog(c, "label", `Dropped by ${labelOf(c)?.name}.`);
          c.labelId = null;
        }
        if (kind === "jail" || kind === "cancelled") c.totals.scandals += 1;
        newLog(c, "scandal", reason);
      };

      const maybeEvent = (c: Career, base = 0.22) => {
        if (c.pendingEvent || isLocked(c)) return;
        const rate = base * PERSONAS[c.persona].eventRate * cfg().eventRateMultiplier;
        if (Math.random() > rate) return;
        const lvl = levelFor(c.stats.fame).level;
        const pool = EVENTS.filter((e) => (e.minLevel ?? 1) <= lvl && (e.id !== "label-feud" || c.labelId));
        c.pendingEvent = pool[Math.floor(Math.random() * pool.length)].id;
      };

      /** Count progress toward today's quests; celebrate any that just completed. */
      const quest = (c: Career, kind: QuestKind, n = 1) => {
        const q = structuredClone(currentQuests(c));
        for (const it of q.list) {
          if (it.kind !== kind || it.claimed || it.progress >= it.target) continue;
          it.progress = Math.min(it.target, it.progress + n);
          if (it.progress >= it.target) {
            set((s) => ({ celebrations: [...s.celebrations, { id: uid(), kind: "daily", title: "QUEST COMPLETE", subtitle: `${questLabel(it)} · claim it on Home` }] }));
          }
        }
        c.quests = q;
      };

      const commit = (c: Career) => set({ career: { ...c } });
      const draft = () => {
        const c = get().career;
        return c ? (structuredClone(c) as Career) : null;
      };

      return {
        career: null,
        celebrations: [],
        lastOutcome: null,

        createCareer: ({ name, genre, persona, themeSeed }) => {
          let stats: Stats = applyDelta(BASE_STATS, PERSONAS[persona].mods);
          stats = applyDelta(stats, GENRES[genre].bonus);
          if (cfg().startingCashBonus) stats = applyDelta(stats, { cash: cfg().startingCashBonus });
          const now = Date.now();
          const c: Career = {
            id: uid(), name: name.trim(), genre, persona, createdAt: now, week: 1, stats,
            labelId: null, crew: {}, releases: [], songs: [], queue: [], log: [], lockout: null,
            lastEnergyTick: now, daily: { lastClaim: null, streak: 0, best: 0 }, renameCount: 0,
            totals: { gigs: 0, earnings: 0, sellouts: 0, scandals: 0, collabs: 0, beefs: 0 },
            peakLevel: 1, unlockedTours: TOURS.filter((t) => t.level === 1).map((t) => t.id),
            rivals: { weekKey: weekKey(), points: 0, cooldowns: {}, lastPaidWeek: null }, pendingEvent: null,
            tutorial: { step: 0 },
          };
          newLog(c, "system", `${c.name} starts out in Mom's basement — ${GENRES[genre].name}, ${PERSONAS[persona].name}.`);
          if (themeSeed !== undefined) {
            const s: Song = { id: uid(), title: `${c.name} Theme`, seed: themeSeed, genre, createdAt: now, source: "theme" };
            c.songs.push(s);
            c.queue.push(s.id);
          }
          set({ career: c, celebrations: [], lastOutcome: null });
        },

        tick: () => {
          const c = draft();
          if (!c) return;
          let changed = false;
          const now = Date.now();
          const interval = cfg().energyRegenSeconds * 1000 * (useMembership.getState().removeTimers ? 0.5 : 1);
          const steps = Math.floor((now - c.lastEnergyTick) / interval);
          if (steps > 0) {
            if (c.stats.energy < MAX_ENERGY) {
              c.stats.energy = Math.min(MAX_ENERGY, c.stats.energy + steps);
              // Slow passive health recovery while resting.
              c.stats.health = Math.min(100, c.stats.health + Math.floor(steps / 6));
            }
            c.lastEnergyTick += steps * interval;
            changed = true;
          }
          if (c.releases.length && !c.royaltiesAt) { c.royaltiesAt = now; changed = true; }
          if (c.lockout && c.lockout.until <= now) {
            newLog(c, "system", `Back in action after ${c.lockout.kind}.`);
            c.lockout = null;
            changed = true;
          }
          const wk = weekKey();
          if (c.rivals.weekKey !== wk) {
            const chart = buildChart(c, new Date(c.rivals.weekKey + "T23:59:59"));
            const rank = chart.findIndex((r) => r.isPlayer) + 1;
            const reward = chartReward(rank, levelFor(c.stats.fame).level);
            if (reward && c.rivals.lastPaidWeek !== c.rivals.weekKey) {
              c.stats = applyDelta(c.stats, reward);
              newLog(c, "rival", `Finished #${rank} on the weekly chart.`);
              set((s) => ({ celebrations: [...s.celebrations, { id: uid(), kind: "rival", title: `CHART #${rank}`, subtitle: `Weekly reward: $${(reward.cash ?? 0).toLocaleString()}` }] }));
            }
            c.rivals = { weekKey: wk, points: 0, cooldowns: {}, lastPaidWeek: c.rivals.weekKey };
            changed = true;
          }
          if (changed) commit(c);
        },

        startShow: (id, setlist) => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          if (isLocked(c)) return lockMsg(c);
          if (c.pendingEvent) return { ok: false, message: "Deal with the situation first." };
          if (c.pendingShow) return { ok: false, message: "You're already mid-show." };
          const t = TOURS.find((x) => x.id === id)!;
          const lvl = levelFor(c.stats.fame).level;
          if (lvl < t.level) return { ok: false, message: `Unlocks at level ${t.level}.` };
          const b = crewBonuses(c);
          const energy = Math.round(t.energy * b.tourEnergyMult * (PERSONAS[c.persona].tourEnergy ?? 1));
          if (c.stats.energy < energy) return { ok: false, message: `Need ${energy} energy.` };
          if (c.stats.cash < t.cost) return { ok: false, message: `Need $${t.cost.toLocaleString()} for production costs.` };
          const pool = songPool(c);
          const keys = setlist.filter((k, i) => pool.some((p) => p.key === k) && setlist.indexOf(k) === i).slice(0, SET_SLOTS[t.id] ?? 3);
          if (!keys.length) return { ok: false, message: "Pick at least one song." };

          const draw = Math.min(1, 0.35 + c.stats.hype / 160 + Math.log10(1 + c.stats.fans) / 12 + b.selloutBonus);
          const sellout = Math.random() < draw * 0.7;
          const attendance = sellout ? 1 : 0.4 + Math.random() * 0.5 * draw;
          c.stats = applyDelta(c.stats, { energy: -energy, cash: -t.cost });
          const show: PendingShow = { tourId: t.id, setlist: keys, attendance, sellout, requestKey: fanRequest(c, pool), at: Date.now() };
          c.pendingShow = show;
          c.lastSetlist = keys;
          if (c.tutorial && c.tutorial.step <= 2) c.tutorial = { step: 3 };
          commit(c);
          return { ok: true, message: "Showtime!", show };
        },

        finishShow: (performance, encore) => {
          const c = draft();
          if (!c?.pendingShow) return { ok: false, message: "No show in progress." };
          const show = c.pendingShow;
          const t = TOURS.find((x) => x.id === show.tourId)!;
          const b = crewBonuses(c);
          const label = labelOf(c);
          const perf = Math.max(0, Math.min(1, performance));
          const pool = songPool(c);
          const setQ = setlistScore(show.setlist, pool, show.requestKey, SET_SLOTS[t.id] ?? 3);
          const score = showScore(perf, setQ);
          const grade = gradeFor(score);
          const { attendance, sellout } = show;
          const crowd = Math.round(t.capacity * attendance);

          let payM = 0.75 + 0.5 * score;
          let fameM = (0.6 + 0.9 * score) * (grade === "S" ? 1.25 : 1);
          let hypeBonus = Math.round((score - 0.5) * 12);
          let healthBonus = 0;
          let encoreLanded: boolean | undefined;
          let debutTitle: string | undefined;
          if (encore === "hit") { payM += 0.1; fameM += 0.1; }
          if (encore === "walk") healthBonus = 4;
          if (encore === "debut") {
            encoreLanded = Math.random() < debutChance(perf);
            if (encoreLanded) {
              fameM += 0.3;
              hypeBonus += 6;
              const seed = Math.floor(Math.random() * 1e9);
              debutTitle = songTitle(seed);
              const song: Song = { id: uid(), title: debutTitle, seed, genre: c.genre, createdAt: Date.now(), source: "live", appeal: Math.round(55 + perf * 30) };
              c.songs.push(song);
              c.queue.push(song.id);
            } else hypeBonus -= 4;
          }

          let gross = Math.round(t.pay * attendance * b.payMult * (1 + c.stats.hype / 200) * cfg().tourPayMultiplier * payM);
          if (label) gross = Math.round(gross * (1 + label.boost) * (1 - label.share));
          const net = gross - t.cost;
          const famex = (1 + c.stats.hype / 100) * b.tourFameMult * cfg().fameMultiplier;
          const playedRequest = !!show.requestKey && show.setlist.includes(show.requestKey);
          const energyUsed = Math.round(t.energy * b.tourEnergyMult * (PERSONAS[c.persona].tourEnergy ?? 1));
          const delta: Delta = {
            cash: gross,
            fame: Math.round(t.fame * famex * (sellout ? 1.5 : 1) * fameM),
            fans: Math.round(t.fans * attendance * (1 + (label?.boost ?? 0) * 0.5) * (0.7 + 0.6 * score)),
            hype: t.hype + b.pyroHype + (sellout ? 4 : 0) + hypeBonus + (playedRequest ? 2 : 0),
            credibility: t.credibility + (grade === "S" || grade === "A" ? 1 : grade === "D" ? -1 : 0),
            health: -Math.round(t.health * b.healthMult) + healthBonus,
            relationships: -Math.min(8, t.weeks * 2),
          };
          const applied = gain(c, delta);
          // Report the full cost of the show alongside the payout.
          applied.cash = net;
          applied.energy = -energyUsed;
          const points = awardAct(c, GRADE_POINTS[grade] + (sellout ? 5 : 0) + (playedRequest ? 3 : 0));
          quest(c, "gigs");
          if (grade === "S" || grade === "A") quest(c, "gradeA");
          if (grade === "S") quest(c, "gradeS");
          if (sellout) quest(c, "sellout");
          if (playedRequest) quest(c, "request");
          if (encoreLanded) quest(c, "debut");
          if (c.tutorial && c.tutorial.step === 3) c.tutorial = { step: 4 };
          const plays = { ...(c.setPlays ?? {}) };
          show.setlist.forEach((k) => { plays[k] = (plays[k] ?? 0) + 1; });
          c.setPlays = plays;
          c.pendingShow = null;
          c.week += t.weeks;
          c.stats.hype = Math.max(0, c.stats.hype - t.weeks * 3); // buzz fades over time
          c.totals.gigs += 1;
          c.totals.earnings += Math.max(0, gross);
          if (sellout) c.totals.sellouts += 1;
          newLog(c, "gig", `${t.name}: ${crowd.toLocaleString()} fans${sellout ? " (SOLD OUT)" : ""}, grade ${grade}, netted $${net.toLocaleString()}.`);
          if (debutTitle) newLog(c, "release", `Debuted "${debutTitle}" live. It's in your Locker and setlist.`);
          maybeEvent(c);
          commit(c);
          return {
            ok: true,
            title: sellout ? "SOLD OUT!" : `${t.name} done`,
            message: `${crowd.toLocaleString()} fans showed up.`,
            delta: applied,
            points,
            gig: {
              tourId: t.id, tourName: t.name, crowd, capacity: t.capacity, sellout, net, pyro: !!c.crew.pyro, lighting: !!c.crew.lighting,
              grade, performance: perf, setlist: setQ, encore, encoreLanded, debutTitle, playedRequest,
            },
          };
        },

        release: (kind, title, withSong) => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          if (isLocked(c)) return lockMsg(c);
          if (c.pendingEvent) return { ok: false, message: "Deal with the situation first." };
          const r = RELEASES.find((x) => x.kind === kind)!;
          const lvl = levelFor(c.stats.fame).level;
          if (lvl < r.level) return { ok: false, message: `Unlocks at level ${r.level}.` };
          if (c.stats.energy < r.energy) return { ok: false, message: `Need ${r.energy} energy.` };
          if (c.stats.cash < r.cost) return { ok: false, message: `Need $${r.cost.toLocaleString()}.` };

          const quality = Math.round(Math.min(100, Math.max(5, c.stats.credibility * 0.6 + c.stats.hype * 0.2 + Math.random() * 35 + crewBonuses(c).payMult * 5 - 5)));
          const q = quality / 60;
          const label = labelOf(c);
          const m = levelMult(lvl);
          let earnings = Math.round(r.pay * q * m * cfg().releasePayMultiplier);
          if (label) earnings = Math.round(earnings * (1 + label.boost) * (1 - label.share));
          const fansGained = Math.round(r.fans * q * m * (1 + (label?.boost ?? 0) * 0.5));
          const streams = Math.round(fansGained * (8 + Math.random() * 20));
          const delta: Delta = {
            cash: earnings - r.cost,
            energy: -r.energy,
            fame: Math.round(r.fame * q * m * cfg().fameMultiplier),
            fans: fansGained,
            hype: r.hype,
            credibility: Math.round(r.credibility * (quality >= 60 ? 1 : -0.5)),
          };
          const applied = gain(c, delta);
          const id = uid();
          let songId: string | undefined;
          if (withSong) {
            const seed = Math.floor(Math.random() * 1e9);
            const s: Song = { id: uid(), title: title || songTitle(seed), seed, genre: c.genre, createdAt: Date.now(), source: "release", releaseId: id };
            c.songs.push(s);
            c.queue.push(s.id);
            songId = s.id;
          }
          c.releases.unshift({ id, kind, title: title || songTitle(Date.now() % 1e6), week: c.week, quality, streams, earnings, fansGained, labelId: c.labelId, songId });
          c.week += r.weeks;
          c.stats.hype = Math.max(0, c.stats.hype - r.weeks * 2);
          c.totals.earnings += earnings;
          const points = awardAct(c, 10 + Math.floor(quality / 10));
          if (!c.royaltiesAt) c.royaltiesAt = Date.now();
          quest(c, "release");
          if (c.tutorial && c.tutorial.step >= 4 && c.tutorial.step <= 5) c.tutorial = { step: 6 };
          newLog(c, "release", `Released ${r.name} "${c.releases[0].title}" — quality ${quality}/100, ${streams.toLocaleString()} streams.`);
          maybeEvent(c, 0.15);
          commit(c);
          return { ok: true, title: `${r.name} out now!`, message: `Quality ${quality}/100 · ${streams.toLocaleString()} streams · +${points} points`, delta: applied, points };
        },

        signLabel: (id) => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          if (isLocked(c)) return lockMsg(c);
          const l = LABELS.find((x) => x.id === id)!;
          if (levelFor(c.stats.fame).level < l.level) return { ok: false, message: `${l.name} only signs level ${l.level}+ acts.` };
          if (c.labelId === id) return { ok: false, message: "Already signed." };
          c.labelId = id;
          const applied = gain(c, { cash: l.advance, hype: 6, credibility: id === "megaphone" ? -5 : 0 });
          newLog(c, "label", `Signed with ${l.name} — $${l.advance.toLocaleString()} advance.`);
          commit(c);
          return { ok: true, title: "Signed!", message: `Welcome to ${l.name}.`, delta: applied };
        },

        leaveLabel: () => {
          const c = draft();
          if (!c || !c.labelId) return { ok: false, message: "Not signed." };
          const name = labelOf(c)?.name;
          c.labelId = null;
          const applied = gain(c, { credibility: 5, hype: -5 });
          newLog(c, "label", `Walked away from ${name}. Independent again.`);
          commit(c);
          return { ok: true, message: `You left ${name}.`, delta: applied };
        },

        hire: (id) => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          if (isLocked(c)) return lockMsg(c);
          const d = CREW.find((x) => x.id === id)!;
          if (c.crew[id]) return { ok: false, message: "Already on the team." };
          if (levelFor(c.stats.fame).level < d.level) return { ok: false, message: `Unlocks at level ${d.level}.` };
          if (c.stats.cash < d.cost) return { ok: false, message: `Need $${d.cost.toLocaleString()}.` };
          c.crew[id] = true;
          const applied = gain(c, { cash: -d.cost }, { chart: false });
          newLog(c, "crew", `Added ${d.name} (${d.role}).`);
          commit(c);
          return { ok: true, title: "Hired!", message: `${d.emoji} ${d.name} joined the crew.`, delta: applied };
        },

        buy: (id) => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          if (isLocked(c) && c.lockout?.kind !== "dropped") return lockMsg(c);
          const it = STORE.find((x) => x.id === id)!;
          if (levelFor(c.stats.fame).level < it.level) return { ok: false, message: `Unlocks at level ${it.level}.` };
          if (c.stats.cash < it.price) return { ok: false, message: `Need $${it.price.toLocaleString()}.` };
          const applied = gain(c, { ...it.effects, cash: (it.effects.cash ?? 0) - it.price });
          newLog(c, "store", `Bought ${it.name}.`);
          quest(c, "shop");
          commit(c);
          return { ok: true, title: "Purchased", message: `${it.emoji} ${it.name}`, delta: applied };
        },

        collectRoyalties: () => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          const { cash } = royaltiesPending(c);
          if (cash < 1) return { ok: false, message: "Nothing to collect yet. Your songs are still earning." };
          const applied = gain(c, { cash }, { chart: false });
          c.royaltiesAt = Date.now();
          c.totals.earnings += cash;
          quest(c, "royalties");
          newLog(c, "release", `Collected $${cash.toLocaleString()} in royalties.`);
          commit(c);
          return { ok: true, title: "Royalties collected", message: `Your catalog paid $${cash.toLocaleString()}.`, delta: applied };
        },

        claimQuest: (index) => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          const q = structuredClone(currentQuests(c));
          const it = q.list[index];
          if (!it || it.claimed) return { ok: false, message: "Already claimed." };
          if (it.progress < it.target) return { ok: false, message: "Not done yet." };
          it.claimed = true;
          let points = award(c, it.points);
          const applied = it.cash ? gain(c, { cash: it.cash }, { chart: false }) : {};
          let bonus = "";
          if (!q.bonusClaimed && q.list.every((x) => x.claimed)) {
            q.bonusClaimed = true;
            const b = award(c, ALL_QUESTS_BONUS);
            points += b;
            bonus = ` All three done: +${b} bonus points!`;
            set((s) => ({ celebrations: [...s.celebrations, { id: uid(), kind: "daily", title: "ALL QUESTS DONE", subtitle: `+${b} bonus points · new quests tomorrow` }] }));
          }
          c.quests = q;
          newLog(c, "daily", `Quest complete: ${questLabel(it)} (+${points} points).`);
          commit(c);
          return { ok: true, title: "Quest reward", message: `+${points} ⭐ points${it.cash ? ` and $${it.cash.toLocaleString()}` : ""}.${bonus}`, delta: applied, points };
        },

        setTutorial: (step) => {
          const c = draft();
          if (!c) return;
          if (step === null && c.tutorial && c.tutorial.step >= 6) award(c, 25); // finished the tour
          c.tutorial = step === null ? null : { step };
          commit(c);
        },

        setSongAudio: (id, patch) => {
          const c = draft();
          const song = c?.songs.find((x) => x.id === id);
          if (!c || !song) return;
          Object.assign(song, patch);
          if (!patch.ai) delete song.ai;
          commit(c);
        },

        setAnnouncer: (url, name) => {
          const c = draft();
          if (!c) return;
          c.announcerUrl = url;
          c.announcerFor = name;
          commit(c);
        },

        rest: () => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          if (c.pendingEvent) return { ok: false, message: "Deal with the situation first." };
          const applied = gain(c, { health: 15, relationships: 8, hype: -3, energy: 5 });
          c.week += 1;
          newLog(c, "system", "Took a week off at home.");
          commit(c);
          return { ok: true, title: "Week off", message: "Mom made lasagna.", delta: applied };
        },

        beef: (rivalId) => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          if (isLocked(c)) return lockMsg(c);
          const r = RIVALS.find((x) => x.id === rivalId)!;
          if ((c.rivals.cooldowns[rivalId] ?? 0) > Date.now()) return { ok: false, message: `${r.name} is on cooldown.` };
          if (c.stats.energy < 10) return { ok: false, message: "Need 10 energy." };
          const m = levelMult(levelFor(c.stats.fame).level);
          const win = Math.random() < 0.55 + c.stats.hype / 400 - r.power / 10;
          const delta: Delta = win
            ? { fame: Math.round(40 * m), hype: 12, credibility: -6, energy: -10 }
            : { fame: Math.round(10 * m), hype: 4, credibility: -10, energy: -10, relationships: -3 };
          const applied = gain(c, delta);
          c.rivals.cooldowns[rivalId] = Date.now() + 6 * 3600_000;
          c.totals.beefs += 1;
          newLog(c, "rival", win ? `Won the beef with ${r.name}. Diss track of the year.` : `Took an L in the beef with ${r.name}.`);
          maybeEvent(c, 0.25);
          commit(c);
          return { ok: true, title: win ? "You won the beef" : "Ratioed…", message: win ? `${r.name} has no response.` : `${r.name}'s comeback was brutal.`, delta: applied };
        },

        collab: (rivalId) => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          if (isLocked(c)) return lockMsg(c);
          const r = RIVALS.find((x) => x.id === rivalId)!;
          if ((c.rivals.cooldowns[rivalId] ?? 0) > Date.now()) return { ok: false, message: `${r.name} is on cooldown.` };
          if (c.stats.energy < 20) return { ok: false, message: "Need 20 energy." };
          const m = levelMult(levelFor(c.stats.fame).level);
          const applied = gain(c, { fans: Math.round(200 * m * r.power), credibility: 6, fame: Math.round(15 * m), energy: -20, relationships: 4 });
          c.rivals.cooldowns[rivalId] = Date.now() + 6 * 3600_000;
          c.totals.collabs += 1;
          newLog(c, "rival", `Dropped a collab with ${r.name}.`);
          commit(c);
          return { ok: true, title: "Collab dropped!", message: `You and ${r.name} on the same track.`, delta: applied };
        },

        claimDaily: () => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          const today = todayKey();
          if (c.daily.lastClaim === today) return { ok: false, message: "Already claimed today. Come back tomorrow!" };
          const streak = c.daily.lastClaim === yesterdayKey() ? c.daily.streak + 1 : 1;
          const m = levelMult(levelFor(c.stats.fame).level) * (useMembership.getState().premiumPass ? 1.5 : 1) * cfg().dailyRewardMultiplier;
          let reward: Delta = scaleDelta({ cash: 250 + 50 * Math.min(streak, 10), energy: 20 }, m);
          reward.energy = 20;
          const ms = DAILY_MILESTONES[streak];
          if (ms) reward = { ...reward, ...Object.fromEntries(Object.entries(ms.reward).map(([k, v]) => [k, (v ?? 0) + ((reward as Record<string, number>)[k] ?? 0)])) };
          const applied = gain(c, reward, { chart: false });
          c.daily = { lastClaim: today, streak, best: Math.max(c.daily.best, streak) };
          const points = award(c, 10 + Math.min(streak, 7) * 2);
          newLog(c, "daily", `Claimed daily reward (day ${streak}), +${points} points.`);
          if (ms) set((s) => ({ celebrations: [...s.celebrations, { id: uid(), kind: "daily", title: ms.label.toUpperCase(), subtitle: "Streak bonus unlocked!" }] }));
          commit(c);
          return { ok: true, title: `Day ${streak} reward`, message: `${ms ? `${ms.label} bonus! ` : ""}+${points} reward points.`, delta: applied, points };
        },

        rename: (name) => {
          const c = draft();
          if (!c) return { ok: false, message: "No career." };
          const n = name.trim();
          if (n.length < 2 || n.length > 24) return { ok: false, message: "Name must be 2–24 characters." };
          const cost = c.renameCount === 0 ? 0 : cfg().renameCost;
          if (c.stats.cash < cost) return { ok: false, message: `Renaming costs $${cost.toLocaleString()}.` };
          c.stats.cash -= cost;
          newLog(c, "system", `Rebranded from ${c.name} to ${n}.`);
          c.name = n;
          c.renameCount += 1;
          commit(c);
          return { ok: true, message: cost ? `Renamed for $${cost.toLocaleString()}.` : "Renamed — first one's free." };
        },

        resolveEvent: (choice) => {
          const c = draft();
          if (!c || !c.pendingEvent) return;
          const ev = EVENTS.find((e) => e.id === c.pendingEvent)!;
          const ch = ev.choices[choice];
          const badMult = crewBonuses(c).badReduce;
          const weights = ch.outcomes.map((o) => o.p * (o.bad ? badMult : 1));
          let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
          let out: Outcome = ch.outcomes[0];
          for (let i = 0; i < ch.outcomes.length; i++) {
            roll -= weights[i];
            if (roll <= 0) { out = ch.outcomes[i]; break; }
          }
          const m = levelMult(levelFor(c.stats.fame).level);
          const scaled: Delta = { ...out.effects };
          (["cash", "fame", "fans"] as const).forEach((k) => { if (scaled[k]) scaled[k] = Math.round(scaled[k]! * m); });
          const applied = gain(c, scaled);
          c.pendingEvent = null;
          newLog(c, ev.kind === "scandal" ? "scandal" : "event", `${ev.title}: ${out.text}`);
          if (out.lockout) lockout(c, out.lockout.kind, out.lockout.minutes, out.text, out.lockout.bail ? Math.round(out.lockout.bail * m) : undefined);
          commit(c);
          set({ lastOutcome: { title: ev.title, text: out.text, delta: applied } });
        },

        clearOutcome: () => set({ lastOutcome: null }),

        payBail: () => {
          const c = draft();
          if (!c?.lockout?.bail) return { ok: false, message: "No bail available." };
          if (c.stats.cash < c.lockout.bail) return { ok: false, message: `Bail is $${c.lockout.bail.toLocaleString()}.` };
          c.stats.cash -= c.lockout.bail;
          newLog(c, "scandal", `Posted $${c.lockout.bail.toLocaleString()} bail.`);
          c.lockout = null;
          commit(c);
          return { ok: true, message: "You're out. Try to behave." };
        },

        retire: () => set({ career: null, celebrations: [], lastOutcome: null }),

        addSong: (s) => {
          const c = draft()!;
          const song: Song = { ...s, id: uid(), createdAt: Date.now() };
          c.songs.push(song);
          c.queue.push(song.id);
          commit(c);
          return song;
        },

        removeSong: (id) => {
          const c = draft();
          if (!c) return;
          c.songs = c.songs.filter((s) => s.id !== id);
          c.queue = c.queue.filter((q) => q !== id);
          commit(c);
        },

        setQueue: (ids) => {
          const c = draft();
          if (!c) return;
          c.queue = ids;
          commit(c);
        },

        grantCash: (n, why) => {
          const c = draft();
          if (!c) return;
          c.stats.cash += n;
          newLog(c, "store", why);
          commit(c);
        },

        receiveGift: (gift, message) => {
          const c = draft();
          if (!c) return;
          const applied = gain(c, gift, { chart: false });
          newLog(c, "event", message || "A gift from TourStar HQ.");
          commit(c);
          set(() => ({ lastOutcome: { title: "A GIFT FOR YOU", text: message || "A little something from TourStar HQ.", delta: applied } }));
        },

        receiveEvent: (eventId) => {
          const c = draft();
          if (!c || c.pendingEvent || isLocked(c) || !EVENTS.some((e) => e.id === eventId)) return false;
          c.pendingEvent = eventId;
          commit(c);
          return true;
        },

        dismissCelebration: () => set((s) => ({ celebrations: s.celebrations.slice(1) })),
      };
    },
    {
      name: "tourstar-career",
      storage: createJSONStorage(() => gameStorage),
      version: 1,
      partialize: (s) => ({ career: s.career }),
    },
  ),
);

export const useCareer = () => useGame((s) => s.career);
