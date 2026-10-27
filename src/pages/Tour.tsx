import { useState } from "react";
import { PERSONAS, TOURS, type TourDef } from "../game/data";
import { crewBonuses, fmtMoney, fmtNum, labelOf, levelFor } from "../game/engine";
import { useGame } from "../game/store";
import { Card, PageTitle, Tag } from "../components/ui";
import SetlistSheet from "../components/SetlistSheet";
import { SET_SLOTS } from "../game/setlist";
import { useConcert } from "../concert/useConcert";
import { useConfig } from "../game/config";

export default function Tour() {
  const c = useGame((s) => s.career)!;
  const payMultiplier = useConfig((s) => s.config.tourPayMultiplier);
  const resume = useConcert((s) => s.start);
  const [booking, setBooking] = useState<TourDef | null>(null);
  const pending = c.pendingShow;
  const lvl = levelFor(c.stats.fame).level;
  const b = crewBonuses(c);
  const label = labelOf(c);

  return (
    <div>
      <PageTitle title="TOUR" sub="Bigger stages pay more — and cost more energy, health and time." />
      {pending && (
        <Card className="mb-4" glow="pink">
          <div className="text-sm">🎤 You're mid-show at the <b>{TOURS.find((t) => t.id === pending.tourId)?.name}</b>. The crowd is still waiting.</div>
          <button className="btn btn-pink w-full mt-3" onClick={() => resume(pending)}>Back on stage</button>
        </Card>
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
                <button className={`btn btn-primary w-full mt-3 ${c.tutorial?.step === 2 && t.id === "open-mic" ? "ring-2 ring-[var(--gold)] animate-pulse" : ""}`} disabled={!can || !!pending} onClick={() => setBooking(t)}>
                  {c.stats.energy < energy ? "Not enough energy" : c.stats.cash < t.cost ? "Can't cover costs" : "▶ Hit the road"}
                </button>
              )}
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-fg text-center mt-4">Sellout odds rise with Hype, Fans and Pyro. Pay and fame depend on how you play and your setlist.</p>
      {booking && <SetlistSheet tour={booking} onClose={() => setBooking(null)} />}
    </div>
  );
}
