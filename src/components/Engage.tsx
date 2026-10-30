// Cards for the time-limited things: a promoter's gig offer and the current tour event.
import { useEffect, useState } from "react";
import { useEnergySheet } from "./KeepPlaying";
import { Link } from "react-router-dom";
import { PERSONAS, TOURS, type TourDef } from "../game/data";
import { crewBonuses, fmtNum, levelFor } from "../game/engine";
import { offerVenue } from "../game/offers";
import { useGame } from "../game/store";
import type { ShowVenue } from "../game/setlist";
import { claimEventReward, eventLive, eventTour, eventVenue, timeLeft, useTourEvent } from "../lib/tourEvent";
import { useCloud } from "../lib/cloud";
import { Card, Tag, toast } from "./ui";

export function useTicker(ms = 30_000) {
  const [, f] = useState(0);
  useEffect(() => { const t = setInterval(() => f((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
}

/** A promoter's offer: book it before it expires. `onBook` opens the setlist sheet. */
export function OfferCard({ onBook, compact }: { onBook?: (t: TourDef, v: ShowVenue) => void; compact?: boolean }) {
  useTicker();
  const c = useGame((s) => s.career)!;
  const dismiss = useGame((s) => s.dismissOffer);
  const o = c.offer;
  if (!o || o.expires <= Date.now()) return null;
  const t = TOURS.find((x) => x.id === o.tourId);
  if (!t) return null;
  const energy = Math.round(t.energy * crewBonuses(c).tourEnergyMult * (PERSONAS[c.persona].tourEnergy ?? 1));
  const can = c.stats.energy >= energy && c.stats.cash >= t.cost && !c.pendingShow;
  return (
    <Card glow="gold" className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <span className="text-3xl">📞</span>
          <div className="min-w-0">
            <div className="font-pixel text-[9px]" style={{ color: "var(--gold)" }}>GIG OFFER</div>
            <div className="font-bold mt-1">{o.emoji} {o.venue}</div>
            <div className="text-[11px] text-muted-fg mt-0.5">{o.promoter} · {t.name}-size show</div>
          </div>
        </div>
        <Tag color="var(--neon-pink)">⏱ {timeLeft(new Date(o.expires).toISOString())}</Tag>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
        <span className="px-1.5 py-0.5 rounded bg-black/40" style={{ color: "var(--success)" }}>💵 +{o.payBonus}% pay</span>
        <span className="px-1.5 py-0.5 rounded bg-black/40" style={{ color: "var(--gold)" }}>★ +{o.fameBonus}% fame</span>
        <span className="px-1.5 py-0.5 rounded bg-black/40">⚡ -{energy}</span>
      </div>
      {compact
        ? <Link to="/tour" className="btn btn-gold w-full mt-3 text-center block">See the offer</Link>
        : (
          <div className="grid grid-cols-[1fr_auto] gap-2 mt-3">
            {c.stats.energy < energy && !c.pendingShow
              ? <button className="btn btn-ghost" onClick={() => useEnergySheet.getState().open(energy)}>⚡ Need {energy} energy</button>
              : <button className="btn btn-gold" disabled={!can} onClick={() => onBook?.(t, offerVenue(o))}>▶ Take the gig</button>}
            <button className="btn btn-ghost text-xs" onClick={dismiss}>Pass</button>
          </div>
        )}
    </Card>
  );
}

/** The live tour event: special venue, progress toward the goal, and the collectible. */
export function EventCard({ onBook, compact }: { onBook?: (t: TourDef, v: ShowVenue) => void; compact?: boolean }) {
  useTicker();
  const e = useTourEvent((s) => s.event);
  const c = useGame((s) => s.career)!;
  const markClaimed = useGame((s) => s.markEventClaimed);
  const signedIn = useCloud((s) => !!s.session);
  const [busy, setBusy] = useState(false);
  if (!e || !eventLive(e)) return null;
  const lvl = levelFor(c.stats.fame).level;
  const t = eventTour(e, lvl);
  const locked = lvl < t.level;
  const prog = c.event?.id === e.id ? c.event : { id: e.id, shows: 0, claimed: false };
  const done = prog.shows >= e.goal;
  const energy = Math.round(t.energy * crewBonuses(c).tourEnergyMult * (PERSONAS[c.persona].tourEnergy ?? 1));
  const can = !locked && c.stats.energy >= energy && c.stats.cash >= t.cost && !c.pendingShow;
  const reward = e.reward.map((r) => ("emoji" in r ? `${r.emoji} ` : "") + ("name" in r && r.name ? r.name : r.type)).join(" + ");

  const claim = async () => {
    setBusy(true);
    const r = await claimEventReward(e.id);
    setBusy(false);
    toast(r);
    if (r.ok) markClaimed(e.id);
  };

  return (
    <Card className="mb-4" style={{ borderColor: "var(--neon-pink)", borderWidth: 2 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <span className="text-3xl">{e.emoji}</span>
          <div className="min-w-0">
            <div className="font-pixel text-[9px]" style={{ color: "var(--neon-pink)" }}>LIMITED EVENT</div>
            <div className="font-bold mt-1">{e.name}</div>
            {e.blurb && <div className="text-[11px] text-muted-fg mt-0.5">{e.blurb}</div>}
          </div>
        </div>
        <Tag color="var(--neon-pink)">ends {timeLeft(e.ends)}</Tag>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[11px] mb-1"><span>Play {e.goal} shows at {e.venue.emoji} {e.venue.name}</span><span className="tabular-nums">{Math.min(prog.shows, e.goal)}/{e.goal}</span></div>
        <div className="h-2 rounded bg-black/50 overflow-hidden"><div className="h-full" style={{ width: `${Math.min(100, (prog.shows / e.goal) * 100)}%`, background: "var(--neon-pink)" }} /></div>
        {reward && <div className="text-[11px] text-muted-fg mt-2">Reward: <b className="text-fg">{reward}</b> (only during this event)</div>}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
        <span className="px-1.5 py-0.5 rounded bg-black/40">{t.emoji} {t.name}-size · {fmtNum(e.venue.capacity || t.capacity)} fans</span>
        {e.venue.pay_bonus > 0 && <span className="px-1.5 py-0.5 rounded bg-black/40" style={{ color: "var(--success)" }}>💵 +{e.venue.pay_bonus}% pay</span>}
        {e.venue.fame_bonus > 0 && <span className="px-1.5 py-0.5 rounded bg-black/40" style={{ color: "var(--gold)" }}>★ +{e.venue.fame_bonus}% fame</span>}
      </div>
      {done && !prog.claimed ? (
        signedIn
          ? <button className="btn btn-pink w-full mt-3" disabled={busy} onClick={() => void claim()}>{busy ? "Claiming…" : "🎁 Claim your reward"}</button>
          : <Link to="/login" className="btn btn-pink w-full mt-3 block text-center">Sign in to keep your reward</Link>
      ) : prog.claimed ? (
        <p className="text-xs text-center mt-3" style={{ color: "var(--success)" }}>✓ Collected. You can keep playing the event stage for the bonuses.</p>
      ) : null}
      {!prog.claimed && !done && (compact
        ? <Link to="/tour" className="btn btn-pink w-full mt-3 block text-center">Play the event</Link>
        : locked ? <button className="btn btn-ghost w-full mt-3" disabled>🔒 Unlocks at LV{t.level}</button>
        : !locked && c.stats.energy < energy && !c.pendingShow
          ? <button className="btn btn-ghost w-full mt-3" onClick={() => useEnergySheet.getState().open(energy)}>⚡ Need {energy} energy · options</button>
          : <button className="btn btn-pink w-full mt-3" disabled={!can} onClick={() => onBook?.(t, eventVenue(e))}>▶ Play the event</button>)}
      {prog.claimed && !compact && !locked && <button className="btn btn-ghost w-full mt-2 text-xs" disabled={!can} onClick={() => onBook?.(t, eventVenue(e))}>Play again</button>}
    </Card>
  );
}
