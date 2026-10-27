import { useEffect, useState } from "react";
import { RIVALS } from "../game/data";
import { buildChart, chartReward, levelFor, weekKey } from "../game/engine";
import { useGame } from "../game/store";
import { useMembership } from "../game/settings";
import { Card, DeltaChips, PageTitle, toast } from "../components/ui";

function timeToReset() {
  const next = new Date(weekKey() + "T00:00:00");
  next.setDate(next.getDate() + 7);
  const ms = next.getTime() - Date.now();
  const d = Math.floor(ms / 864e5);
  const h = Math.floor((ms % 864e5) / 36e5);
  return `${d}d ${h}h`;
}

export default function Rivals() {
  const c = useGame((s) => s.career)!;
  const { beef, collab } = useGame();
  const gold = useMembership((s) => s.premiumPass);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const chart = buildChart(c);
  const rank = chart.findIndex((r) => r.isPlayer) + 1;
  const reward = chartReward(rank, levelFor(c.stats.fame).level);

  return (
    <div>
      <PageTitle title="RIVALS" sub={`Weekly chart · resets in ${timeToReset()}`} />
      <Card glow="pink" className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-pixel text-[8px] text-muted-fg">YOUR RANK</div>
            <div className="font-pixel text-xl mt-2" style={{ color: "var(--neon-pink)" }}>#{rank}</div>
          </div>
          <div className="text-right">
            <div className="font-pixel text-[8px] text-muted-fg mb-2">IF THE WEEK ENDED NOW</div>
            {reward ? <DeltaChips delta={reward} className="justify-end" /> : <span className="text-xs text-muted-fg">Top 10 to earn rewards</span>}
          </div>
        </div>
        <p className="text-[11px] text-muted-fg mt-3">Chart points come from fame and hype you earn this week.</p>
      </Card>

      <ol className="space-y-2">
        {chart.map((row, i) => {
          const r = RIVALS.find((x) => x.id === row.id);
          const cd = r ? (c.rivals.cooldowns[r.id] ?? 0) > Date.now() : false;
          return (
            <li key={row.id} className="panel p-3" style={row.isPlayer ? { borderColor: "var(--gold)" } : undefined}>
              <div className="flex items-center gap-3">
                <span className="font-pixel text-[10px] w-7" style={{ color: i < 3 ? "var(--gold)" : "var(--muted-foreground)" }}>#{i + 1}</span>
                <span className="text-xl">{row.emoji}</span>
                <span className={`flex-1 text-sm truncate ${row.isPlayer ? "font-bold" : ""}`} style={row.isPlayer && gold ? { color: "var(--gold)" } : undefined}>{row.name}{row.isPlayer && " (you)"}</span>
                <span className="font-pixel text-[9px] text-muted-fg">{row.points.toLocaleString()}</span>
              </div>
              {r && (
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-danger flex-1 !py-2" disabled={cd} onClick={() => toast(beef(r.id))}>🔥 Beef</button>
                  <button className="btn btn-primary flex-1 !py-2" disabled={cd} onClick={() => toast(collab(r.id))}>🤝 Collab</button>
                </div>
              )}
              {r && cd && <div className="text-[10px] text-muted-fg mt-1 text-center">Cooling off — try again in a few hours</div>}
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-muted-fg text-center mt-4">Beef: +fame, +hype, −credibility (10⚡). Collab: +fans, +credibility (20⚡).</p>
    </div>
  );
}
