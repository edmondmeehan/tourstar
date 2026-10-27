import { CREW } from "../game/data";
import { fmtMoney, levelFor } from "../game/engine";
import { useGame } from "../game/store";
import { Card, PageTitle, Tag, toast } from "../components/ui";

export default function Crew() {
  const c = useGame((s) => s.career)!;
  const hire = useGame((s) => s.hire);
  const lvl = levelFor(c.stats.fame).level;
  const groups = ["Manager", "Stylist", "Gear"] as const;

  return (
    <div>
      <PageTitle title="CREW" sub="Build your team. Higher tiers replace lower ones." />
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
