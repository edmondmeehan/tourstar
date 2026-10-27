import { useNavigate } from "react-router-dom";
import { GENRES, LEVELS, PERSONAS } from "../game/data";
import { fmtMoney, legacyScore, levelFor } from "../game/engine";
import { useGame } from "../game/store";
import { Card, PageTitle, StatBar, askConfirm } from "../components/ui";
import type { Stats } from "../game/types";

function legacyTitle(score: number) {
  if (score > 200000) return "Hall of Fame Icon";
  if (score > 60000) return "Generational Talent";
  if (score > 15000) return "Household Name";
  if (score > 4000) return "Cult Favorite";
  if (score > 800) return "Local Legend";
  return "Basement Hopeful";
}

export default function Summary() {
  const c = useGame((s) => s.career)!;
  const retire = useGame((s) => s.retire);
  const nav = useNavigate();
  const lvl = levelFor(c.stats.fame);
  const score = legacyScore(c);
  const days = Math.max(1, Math.round((Date.now() - c.createdAt) / 864e5));

  const doRetire = () => {
    askConfirm(`Retire ${c.name}? Your career will be wiped and you'll start over.`, () => { retire(); nav("/create"); }, { yes: "Retire", danger: true });
  };

  return (
    <div>
      <PageTitle title="CAREER STATS" sub={`${GENRES[c.genre].name} · ${PERSONAS[c.persona].name} · ${days} day${days > 1 ? "s" : ""} in the game`} />
      <Card glow="gold" className="text-center mb-4">
        <div className="font-pixel text-[8px] text-muted-fg">LEGACY SCORE</div>
        <div className="font-pixel text-2xl my-3 text-glow-gold" style={{ color: "var(--gold)" }}>{score.toLocaleString()}</div>
        <div className="text-sm">{legacyTitle(score)}</div>
      </Card>

      <Card className="mb-4">
        <div className="font-pixel text-[8px] text-muted-fg mb-3">CAREER PATH</div>
        <div className="flex justify-between">
          {LEVELS.map((l) => (
            <div key={l.level} className="flex flex-col items-center gap-1 flex-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-pixel text-[8px] border" style={{ borderColor: l.level <= lvl.level ? "var(--gold)" : "var(--border)", background: l.level <= lvl.level ? "oklch(82% .17 90 / .2)" : "transparent", color: l.level <= lvl.level ? "var(--gold)" : "var(--muted-foreground)" }}>{l.level}</div>
              <div className="text-[9px] text-center leading-tight text-muted-fg">{l.name}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {[
          ["Gigs played", c.totals.gigs],
          ["Sellouts", c.totals.sellouts],
          ["Releases", c.releases.length],
          ["Songs in Locker", c.songs.length],
          ["Lifetime earnings", fmtMoney(c.totals.earnings)],
          ["Scandals", c.totals.scandals],
          ["Collabs", c.totals.collabs],
          ["Beefs", c.totals.beefs],
          ["Best daily streak", c.daily.best],
          ["Weeks in career", c.week],
        ].map(([l, v]) => (
          <div key={l} className="panel p-3">
            <div className="text-[11px] text-muted-fg">{l}</div>
            <div className="font-pixel text-[11px] mt-2">{typeof v === "number" ? v.toLocaleString() : v}</div>
          </div>
        ))}
      </div>

      <Card className="mb-6 space-y-3">
        {(["fame", "fans", "cash", "credibility", "hype", "health", "relationships"] as (keyof Stats)[]).map((k) => <StatBar key={k} k={k} value={c.stats[k]} />)}
      </Card>

      <button className="btn btn-danger w-full mb-6" onClick={doRetire}>Retire &amp; Start Over</button>
    </div>
  );
}
