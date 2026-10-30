// Keep playing: the tour challenges and Promoter's Pass, the out-of-energy sheet (free options first),
// the one-time starter offer, and the "next goal" card. Gold is spent on the server (spend_gold) and
// never turns into fame, cash or reward points.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { create } from "zustand";
import { TOURS, MAX_ENERGY } from "../game/data";
import { bonusEnergyLeft, useGame } from "../game/store";
import { challengeMet, challengeSteps, nextChallenge, PASS_GOLD, REFILL_GOLD } from "../game/economy";
import { levelFor, todayKey } from "../game/engine";
import { cfg } from "../game/config";
import { useMembership } from "../game/settings";
import { buyDrop, refreshGold, useGold, visibleDrops, type Drop } from "../lib/gold";
import { supabase, useCloud } from "../lib/cloud";
import { useOnline } from "../lib/offline";
import { askNotificationPermission, scheduleReminders, useNotify } from "../lib/notify";
import { isNative } from "../lib/native";
import { Bar, Modal, toast } from "./ui";

const REFILLS_PER_DAY = 3;

async function spendGold(kind: "refill" | "pass", ref?: string): Promise<{ ok: boolean; message?: string }> {
  if (!supabase || !useCloud.getState().session) return { ok: false, message: "Sign in to use Gold Records." };
  if (!useOnline.getState().online) return { ok: false, message: "Gold needs a connection." };
  const { error } = await supabase.rpc("spend_gold", { p_kind: kind, p_ref: ref ?? null });
  if (error) return { ok: false, message: error.message };
  void refreshGold();
  return { ok: true };
}

/* ---------------- Tour challenge + Promoter's Pass ---------------- */

export function ChallengeBox({ tourId }: { tourId: string }) {
  const c = useGame((s) => s.career)!;
  const grantPass = useGame((s) => s.grantPass);
  const gold = useGold((s) => s.gold);
  const [busy, setBusy] = useState(false);
  const t = TOURS.find((x) => x.id === tourId)!;
  const steps = challengeSteps(c, tourId);
  const usePass = async () => {
    setBusy(true);
    const r = await spendGold("pass", tourId);
    setBusy(false);
    if (!r.ok) return toast({ ok: false, message: r.message ?? "Couldn't use the pass." });
    grantPass(tourId);
    toast({ ok: true, title: "Promoter's Pass", message: `The ${t.name} is open. Go get 'em.` });
  };
  return (
    <div className="mt-3 rounded-lg border border-[var(--gold)]/40 bg-black/30 p-3">
      <div className="font-pixel text-[8px] mb-2" style={{ color: "var(--gold)" }}>🎯 PROVE IT TO THE PROMOTERS</div>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="text-xs">
            <div className="flex justify-between"><span>{s.have >= s.need ? "✅" : "▫️"} {s.label}</span><span className="tabular-nums text-muted-fg">{Math.min(s.have, s.need)}/{s.need}</span></div>
            <div className="mt-1"><Bar pct={Math.min(100, (s.have / s.need) * 100)} color={s.have >= s.need ? "var(--success)" : "var(--gold)"} /></div>
          </li>
        ))}
      </ul>
      <button className="btn btn-gold w-full mt-3 text-xs" disabled={busy} onClick={() => void usePass()}>
        {busy ? "…" : `💿 Promoter's Pass · ${PASS_GOLD} Gold`}
      </button>
      <p className="text-[10px] text-muted-fg mt-1.5 text-center">
        Skips the challenge for this tour only. You have 💿{gold}. {gold < PASS_GOLD && <Link to="/premium" className="underline" style={{ color: "var(--gold)" }}>Get Gold</Link>}
      </p>
    </div>
  );
}

export const tourOpen = (tourId: string) => {
  const c = useGame.getState().career;
  return !!c && challengeMet(c, tourId);
};

/* ---------------- Next goal card (Home) ---------------- */

export function NextGoalCard() {
  const c = useGame((s) => s.career);
  if (!c) return null;
  const lvl = levelFor(c.stats.fame).level;
  const next = nextChallenge(c, lvl, TOURS);
  if (!next) return null;
  const t = TOURS.find((x) => x.id === next.tourId)!;
  const done = next.steps.reduce((n, s) => n + Math.min(s.have, s.need), 0);
  const total = next.steps.reduce((n, s) => n + s.need, 0);
  return (
    <Link to="/tour" className="panel block px-4 py-3 mb-4 hover:border-gold">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{t.emoji}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold">Next goal: the {t.name}</span>
          <span className="block text-xs text-muted-fg">{next.steps.filter((s) => s.have < s.need).map((s) => { const n = s.need - s.have; const w = s.label === "Shows played" ? "show" : s.label === "Sellouts" ? "sellout" : "release"; return `${n} more ${w}${n === 1 ? "" : "s"}`; }).join(" · ")}</span>
        </span>
        <span className="text-muted-fg">›</span>
      </div>
      <div className="mt-2"><Bar pct={(done / total) * 100} color="var(--gold)" /></div>
    </Link>
  );
}

/* ---------------- Out of energy ---------------- */

export const useEnergySheet = create<{ need: number | null; open: (need: number) => void; close: () => void }>((set) => ({
  need: null,
  open: (need) => set({ need }),
  close: () => set({ need: null }),
}));

function minutesTo(c: { stats: { energy: number } }, target: number) {
  const per = cfg().energyRegenSeconds * (useMembership.getState().removeTimers ? 0.5 : 1);
  return Math.max(1, Math.ceil(((Math.min(MAX_ENERGY, target) - c.stats.energy) * per) / 60));
}
const fmtWait = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim());

export function EnergySheet() {
  const need = useEnergySheet((s) => s.need);
  const close = useEnergySheet((s) => s.close);
  const c = useGame((s) => s.career);
  const grantRefill = useGame((s) => s.grantRefill);
  const rest = useGame((s) => s.rest);
  const gold = useGold((s) => s.gold);
  const vip = useMembership((s) => s.removeTimers);
  const notify = useNotify((s) => s.enabled && s.status === "granted");
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!c || need === null) return null;
  const go = (to: string) => { close(); nav(to); };
  const today = todayKey();
  const usedRefills = c.refills?.day === today ? c.refills.n : 0;
  const dailyReady = c.daily.lastClaim !== today;
  const bonusLeft = bonusEnergyLeft(c);
  const refill = async () => {
    setBusy(true);
    const r = await spendGold("refill");
    setBusy(false);
    if (!r.ok) return toast({ ok: false, message: r.message ?? "Couldn't refill." });
    grantRefill();
    close();
    toast({ ok: true, title: "⚡ Full energy", message: "Back on the road." });
  };
  const remind = async () => {
    if (!isNative) return toast({ ok: true, message: `Your energy is full again in about ${fmtWait(minutesTo(c, MAX_ENERGY))}.` });
    if (!notify) await askNotificationPermission();
    await scheduleReminders();
    close();
    toast({ ok: true, message: "We'll ping you when your energy is full." });
  };
  return (
    <Modal open onClose={close}>
      <div className="text-center">
        <div className="text-4xl mb-2">😮‍💨</div>
        <div className="font-pixel text-[10px] mb-2" style={{ color: "var(--gold)" }}>OUT OF ENERGY</div>
        <p className="text-sm text-muted-fg">You have ⚡{c.stats.energy}. This needs ⚡{need}. Ready in about <b className="text-fg">{fmtWait(minutesTo(c, need))}</b>.</p>
      </div>
      <div className="text-[10px] font-pixel text-muted-fg mt-4 mb-2">FREE WHILE YOU WAIT</div>
      <div className="space-y-2">
        {dailyReady && <button className="btn btn-primary w-full text-xs" onClick={() => go("/dashboard")}>🎁 Claim today's reward (+energy)</button>}
        {bonusLeft > 0 && <button className="btn btn-ghost w-full text-xs" onClick={() => { toast(rest()); close(); }}>🛋️ Take a week off (+health, a little energy)</button>}
        <button className="btn btn-ghost w-full text-xs" onClick={() => go("/drums")}>🥁 Practice in Drum School (free)</button>
        <button className="btn btn-ghost w-full text-xs" onClick={() => go("/album")}>🎛️ Write songs in the Studio</button>
        <button className="btn btn-ghost w-full text-xs" onClick={() => void remind()}>🔔 Remind me when I'm full</button>
      </div>
      <div className="text-[10px] font-pixel text-muted-fg mt-4 mb-2">SKIP THE WAIT</div>
      <div className="space-y-2">
        <button className="btn btn-gold w-full text-xs" disabled={busy || usedRefills >= REFILLS_PER_DAY} onClick={() => void refill()}>
          {usedRefills >= REFILLS_PER_DAY ? "No refills left today" : `⚡ Refill now · 💿${REFILL_GOLD} Gold`}
        </button>
        <p className="text-[10px] text-muted-fg text-center">{REFILLS_PER_DAY - usedRefills} of {REFILLS_PER_DAY} refills left today · you have 💿{gold}{gold < REFILL_GOLD ? " · " : ""}{gold < REFILL_GOLD && <button className="underline" style={{ color: "var(--gold)" }} onClick={() => go("/premium")}>Get Gold</button>}</p>
        {!vip && <button className="btn btn-pink w-full text-xs" onClick={() => go("/premium")}>👑 Go VIP: energy refills twice as fast</button>}
      </div>
    </Modal>
  );
}

/* ---------------- Starter offer (once, from day 3) ---------------- */

const STARTER_KEY = "ts_starter_seen";
export function StarterOffer() {
  const c = useGame((s) => s.career);
  const celebrating = useGame((s) => s.celebrations.length > 0);
  const loaded = useGold((s) => s.loaded);
  const days = useGold((s) => s.accountDays);
  useGold((s) => s.drops);
  const paid = useMembership((s) => s.purchases.some((p) => !p.simulated));
  const [drop, setDrop] = useState<Drop | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!loaded || !c || c.tutorial || c.pendingEvent || c.pendingShow || celebrating || paid || days < 2) return;
    let seen = false;
    try { seen = !!localStorage.getItem(STARTER_KEY); } catch { /* private mode */ }
    if (seen) return;
    const d = visibleDrops().find((x) => x.kind === "starter");
    if (!d) return;
    const id = window.setTimeout(() => {
      try { localStorage.setItem(STARTER_KEY, String(Date.now())); } catch { /* fine */ }
      setDrop(d);
    }, 4000);
    return () => window.clearTimeout(id);
  }, [loaded, c, celebrating, paid, days]);
  if (!drop) return null;
  const gold = useGold.getState().gold;
  const hoursLeft = drop.new_players_days !== null ? Math.max(1, (drop.new_players_days - days) * 24) : null;
  const buy = async () => {
    setBusy(true);
    const r = await buyDrop(drop);
    setBusy(false);
    toast(r);
    if (r.ok) setDrop(null);
  };
  return (
    <Modal open onClose={() => setDrop(null)}>
      <div className="text-center">
        {drop.image_url ? <img src={drop.image_url} alt="" className="w-full h-32 object-cover rounded mb-3" /> : <div className="text-5xl mb-2">{drop.emoji}</div>}
        <div className="font-pixel text-[10px] mb-1" style={{ color: "var(--gold)" }}>NEW ARTIST OFFER</div>
        <div className="font-bold text-lg">{drop.name}</div>
        <p className="text-sm text-muted-fg mt-1">{drop.description}</p>
        <div className="mt-3 text-sm">
          {drop.was_gold && <span className="line-through text-muted-fg mr-2">💿{drop.was_gold}</span>}
          <b style={{ color: "var(--gold)" }}>💿{drop.price_gold}</b>
          {hoursLeft && <span className="block text-[11px] text-muted-fg mt-1">Only for new artists · about {hoursLeft >= 48 ? `${Math.round(hoursLeft / 24)} days` : `${hoursLeft} hours`} left</span>}
        </div>
      </div>
      <div className="grid gap-2 mt-4">
        {gold >= drop.price_gold
          ? <button className="btn btn-gold" disabled={busy} onClick={() => void buy()}>{busy ? "…" : "Get it"}</button>
          : <Link to="/premium" className="btn btn-gold text-center" onClick={() => setDrop(null)}>Get Gold</Link>}
        <button className="btn btn-ghost text-xs" onClick={() => setDrop(null)}>Not now</button>
      </div>
    </Modal>
  );
}
