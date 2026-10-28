import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PERSONAS, TOURS, type TourDef } from "../game/data";
import { crewBonuses, fmtMoney, fmtNum, labelOf, levelFor } from "../game/engine";
import { useGame } from "../game/store";
import { Card, PageTitle, Tag } from "../components/ui";
import { drumChops } from "../game/drums";
import SetlistSheet from "../components/SetlistSheet";
import { SET_SLOTS } from "../game/setlist";
import { useConcert } from "../concert/useConcert";
import { useConfig } from "../game/config";
import { openVenueTickets, refreshVenues, trackVenue, useVenues, venueUnlocked, type Venue } from "../lib/venues";
import { useGold } from "../lib/gold";
import { stageTheme } from "../game/cosmetics";

export default function Tour() {
  const c = useGame((s) => s.career)!;
  const payMultiplier = useConfig((s) => s.config.tourPayMultiplier);
  const resume = useConcert((s) => s.start);
  const [booking, setBooking] = useState<{ tour: TourDef; venue?: Venue } | null>(null);
  const venues = useVenues((s) => s.venues);
  useGold((s) => s.owned); // re-check pack-only venues after a purchase
  useEffect(() => { void refreshVenues(); }, []);
  const pending = c.pendingShow;
  const lvl = levelFor(c.stats.fame).level;
  const b = crewBonuses(c);
  const label = labelOf(c);

  return (
    <div>
      <PageTitle title="TOUR" sub="Bigger stages pay more — and cost more energy, health and time." right={<Link to="/how-to-play" className="font-pixel text-[8px] text-electric underline">HOW IT WORKS</Link>} />
      {pending && (
        <Card className="mb-4" glow="pink">
          <div className="text-sm">🎤 You're mid-show at {pending.venue ? <b>{pending.venue.name}</b> : <>the <b>{TOURS.find((t) => t.id === pending.tourId)?.name}</b></>}. The crowd is still waiting.</div>
          <button className="btn btn-pink w-full mt-3" onClick={() => resume(pending)}>Back on stage</button>
        </Card>
      )}
      <Link to="/drums" className="panel flex items-center gap-3 px-4 py-3 mb-4 hover:border-pink">
        <span className="text-2xl">🥁</span>
        <span className="flex-1 text-sm"><b>Drum School</b><span className="block text-xs text-muted-fg">Learn real grooves. Chops boost every show: +{drumChops(c.drums?.best)}% now.</span></span>
        <span className="text-muted-fg">›</span>
      </Link>
      {venues.length > 0 && (
        <>
          <h2 className="font-pixel text-[10px] mb-2" style={{ color: "var(--gold)" }}>★ FEATURED VENUES</h2>
          <div className="space-y-3 mb-6">
            {venues.map((v) => <VenueCard key={v.id} v={v} lvl={lvl} busy={!!pending} onBook={(tour) => setBooking({ tour, venue: v })} />)}
          </div>
          <h2 className="font-pixel text-[10px] mb-2 text-muted-fg">TOUR CIRCUIT</h2>
        </>
      )}
      <div className="space-y-3">
        {TOURS.map((t) => {
          const locked = lvl < t.level;
          const energy = Math.round(t.energy * b.tourEnergyMult * (PERSONAS[c.persona].tourEnergy ?? 1));
          let est = t.pay * b.payMult * payMultiplier;
          if (label) est *= (1 + label.boost) * (1 - label.share);
          const can = !locked && c.stats.energy >= energy && c.stats.cash >= t.cost;
          return (
            <Card key={t.id} className={locked ? "opacity-50" : ""} glow={!locked && can ? "blue" : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="text-3xl">{locked ? "🔒" : t.emoji}</div>
                  <div>
                    <div className="font-bold">{t.name}</div>
                    <div className="text-xs text-muted-fg mt-0.5">Up to {fmtNum(t.capacity)} fans · {t.weeks ? `${t.weeks} week${t.weeks > 1 ? "s" : ""}` : "one night"}</div>
                  </div>
                </div>
                {locked ? <Tag color="var(--gold)">LV{t.level}</Tag> : <Tag color="var(--success)">~{fmtMoney(Math.round(est))}</Tag>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
                <span className="px-1.5 py-0.5 rounded bg-black/40">🎵 {SET_SLOTS[t.id]} songs</span>
                <span className="px-1.5 py-0.5 rounded bg-black/40">⚡ -{energy}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/40">♥ -{Math.round(t.health * b.healthMult)}</span>
                {t.cost > 0 && <span className="px-1.5 py-0.5 rounded bg-black/40">💸 {fmtMoney(t.cost)} costs</span>}
                <span className="px-1.5 py-0.5 rounded bg-black/40" style={{ color: "var(--gold)" }}>★ +{fmtNum(Math.round(t.fame * b.tourFameMult))}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/40" style={{ color: "oklch(75% .2 300)" }}>♪ +{fmtNum(t.fans)}</span>
              </div>
              {!locked && (
                <button className={`btn btn-primary w-full mt-3 ${c.tutorial?.step === 2 && t.id === "open-mic" ? "ring-2 ring-[var(--gold)] animate-pulse" : ""}`} disabled={!can || !!pending} onClick={() => setBooking({ tour: t })}>
                  {c.stats.energy < energy ? "Not enough energy" : c.stats.cash < t.cost ? "Can't cover costs" : "▶ Hit the road"}
                </button>
              )}
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-fg text-center mt-4">Sellout odds rise with Hype, Fans and Pyro. Pay and fame depend on how you play and your setlist.</p>
      {booking && <SetlistSheet tour={booking.tour} venue={booking.venue} onClose={() => setBooking(null)} />}
    </div>
  );
}

function VenueCard({ v, lvl, busy, onBook }: { v: Venue; lvl: number; busy: boolean; onBook: (t: TourDef) => void }) {
  const c = useGame((s) => s.career)!;
  const t = TOURS.find((x) => x.id === v.base_tour);
  useEffect(() => { trackVenue(v.id, "view"); }, [v.id]);
  if (!t) return null;
  const b = crewBonuses(c);
  const energy = Math.round(t.energy * b.tourEnergyMult * (PERSONAS[c.persona].tourEnergy ?? 1));
  const levelLocked = lvl < t.level;
  const packLocked = !venueUnlocked(v);
  const can = !levelLocked && !packLocked && c.stats.energy >= energy && c.stats.cash >= t.cost;
  const th = stageTheme(v.stage_theme);
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  return (
    <Card glow="gold" className={levelLocked ? "opacity-60" : ""}>
      {v.image_url && <img src={v.image_url} alt="" className="w-full h-32 object-cover rounded mb-3" loading="lazy" />}
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <div className="text-3xl">{v.emoji}</div>
          <div className="min-w-0">
            <div className="font-bold">{v.name}</div>
            <div className="text-xs text-muted-fg mt-0.5">{[v.city, `${fmtNum(v.capacity || t.capacity)} capacity`].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        {v.sponsored ? <Tag color="var(--gold)">FEATURED</Tag> : v.pack_only ? <Tag color="var(--neon-pink)">PACK</Tag> : null}
      </div>
      {v.tagline && <p className="text-xs mt-2">{v.tagline}</p>}
      <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
        <span className="px-1.5 py-0.5 rounded bg-black/40">{t.emoji} {t.name}-size show</span>
        <span className="px-1.5 py-0.5 rounded bg-black/40">⚡ -{energy}</span>
        {t.cost > 0 && <span className="px-1.5 py-0.5 rounded bg-black/40">💸 {fmtMoney(t.cost)} costs</span>}
        {v.fame_bonus_pct > 0 && <span className="px-1.5 py-0.5 rounded bg-black/40" style={{ color: "var(--gold)" }}>★ +{v.fame_bonus_pct}% fame</span>}
        {v.stage_theme && <span className="px-1.5 py-0.5 rounded bg-black/40"><span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: hex(th.a) }} />{th.name} stage</span>}
      </div>
      <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: v.ticket_url ? "1fr 1fr" : "1fr" }}>
        {levelLocked ? <button className="btn btn-ghost" disabled>🔒 Unlocks at LV{t.level}</button>
          : packLocked ? <Link to="/store?tab=drops" className="btn btn-gold text-center">Get the pack</Link>
          : <button className="btn btn-primary" disabled={!can || busy} onClick={() => onBook(t)}>{c.stats.energy < energy ? "Not enough energy" : c.stats.cash < t.cost ? "Can't cover costs" : "▶ Play here"}</button>}
        {v.ticket_url && <button className="btn btn-ghost text-xs" onClick={() => void openVenueTickets(v)}>🎟️ {v.ticket_label || "See real upcoming shows"}</button>}
      </div>
    </Card>
  );
}
