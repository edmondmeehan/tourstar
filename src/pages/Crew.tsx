import { Link } from "react-router-dom";
import { CREW, PERSONAS, TOURS, type CrewDef } from "../game/data";
import { crewBonuses, crewTier, fmtMoney, fmtNum, levelFor } from "../game/engine";
import { useConfig } from "../game/config";
import type { Career } from "../game/types";
import { useGame } from "../game/store";
import { Card, PageTitle, Tag, toast } from "../components/ui";

export default function Crew() {
  const c = useGame((s) => s.career)!;
  const hire = useGame((s) => s.hire);
  const lvl = levelFor(c.stats.fame).level;
  const groups = ["Manager", "Stylist", "Gear"] as const;

  return (
    <div>
      <PageTitle title="CREW" sub="Build your team. Higher tiers replace lower ones." right={<Link to="/how-to-play" className="font-pixel text-[8px] text-electric underline">HOW IT WORKS</Link>} />
      {groups.map((g) => (
        <div key={g} className="mb-6">
          <div className="font-pixel text-[9px] text-muted-fg mb-2">{g === "Gear" ? "TOUR GEAR" : `${g.toUpperCase()}S`}</div>
          <div className="space-y-2">
            {CREW.filter((x) => x.role === g).map((x) => {
              const owned = !!c.crew[x.id];
              const locked = lvl < x.level;
              return (
                <Card key={x.id} glow={owned ? "gold" : undefined} className={`flex items-center gap-3 ${locked ? "opacity-50" : ""}`}>
                  <div className="text-3xl">{locked ? "🔒" : x.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{x.name}{x.tier ? <span className="text-muted-fg font-normal"> · Tier {x.tier}</span> : null}</div>
                    <div className="text-xs text-muted-fg">{x.effect}</div>
                    {!owned && <WhatItAdds c={c} x={x} lvl={lvl} />}
                  </div>
                  {owned ? (
                    <Tag color="var(--gold)">HIRED</Tag>
                  ) : locked ? (
                    <Tag>LV{x.level}</Tag>
                  ) : (
                    <button className="btn btn-primary !px-3" disabled={c.stats.cash < x.cost} onClick={() => toast(hire(x.id))}>{fmtMoney(x.cost)}</button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const PAY = [1, 1.1, 1.25, 1.45];
const HYPE = [0, 10, 25, 50];

/** What an upgrade adds at the player's biggest unlocked venue, in real numbers. */
function WhatItAdds({ c, x, lvl }: { c: Career; x: CrewDef; lvl: number }) {
  const payCfg = useConfig((s) => s.config.tourPayMultiplier);
  const t = [...TOURS].reverse().find((v) => v.level <= Math.max(lvl, x.level))!;
  const b = crewBonuses(c);
  let line: string | null = null;
  if (x.role === "Manager" && x.tier && x.tier > crewTier(c, "manager")) {
    const gain = (PAY[x.tier] - PAY[crewTier(c, "manager")]) * t.pay * 0.8 * payCfg;
    line = `≈ +${fmtMoney(Math.round(gain))} per ${t.name}`;
  } else if (x.role === "Stylist" && x.tier && x.tier > crewTier(c, "stylist")) {
    line = `+${HYPE[x.tier] - HYPE[crewTier(c, "stylist")]}% more hype from every show and release`;
  } else if (x.id === "bus") {
    const e = Math.round(t.energy * (PERSONAS[c.persona].tourEnergy ?? 1));
    const e2 = Math.round(e * 0.75);
    line = `${t.name}: ⚡${e} → ⚡${e2}, so ${Math.floor(100 / e2)} shows per full bar instead of ${Math.floor(100 / e)}`;
  } else if (x.id === "lighting") {
    line = `≈ +${fmtNum(Math.round(t.fame * 0.2))} fame per ${t.name}`;
  } else if (x.id === "pyro") {
    line = `More sellouts (1.5× fame) and +3 hype every show`;
  } else if (x.id === "security") {
    line = `${t.name}: ♥-${Math.round(t.health * b.healthMult)} → ♥-${Math.round(t.health * b.healthMult * 0.5)} health per show`;
  }
  return line ? <div className="text-[11px] mt-0.5" style={{ color: "var(--gold)" }}>{line}</div> : null;
}
