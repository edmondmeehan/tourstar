// Weekly league: ~30 real players at your division. Top spots move up a division on Monday, the bottom
// spots move down, and the top 3 win Gold. Score = fame earned this week.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import { Card } from "./ui";
import { normalizeLook } from "../game/looks";
import { useGame } from "../game/store";
import { useCloud } from "../lib/cloud";
import { resetsIn } from "../lib/leaderboard";
import { loadLeague, tierOf, useLeague, TIERS } from "../lib/social";
import { shareCard } from "../lib/share";

export default function LeagueBoard() {
  const signedIn = useCloud((s) => !!s.session);
  const { league, loaded } = useLeague();
  const c = useGame((s) => s.career)!;
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (signedIn) void loadLeague(); }, [signedIn]);

  if (!signedIn) return <Card glow="gold"><p className="text-sm">Weekly leagues pit you against about 30 real players at your level. <Link to="/login" className="underline text-electric">Sign in</Link> to join.</p></Card>;
  if (!loaded && !league) return <p className="text-xs text-muted-fg text-center py-8">Loading your league…</p>;
  if (!league) return <Card><p className="text-sm text-muted-fg">Leagues aren't open yet. Check back soon.</p></Card>;
  if (!league.joined) return <Card><p className="text-sm">Play a show so your save syncs, then you'll be placed in a league.</p></Card>;

  const t = tierOf(league.tier);
  const me = league.rows.find((r) => r.me);
  const r = league.result;
  const ack = async () => { setBusy(true); await loadLeague(true); setBusy(false); };

  return (
    <div>
      {r && (
        <Card glow={r.next_tier > r.tier ? "gold" : "pink"} className="mb-4 text-center">
          <div className="font-pixel text-[9px] text-muted-fg">LAST WEEK</div>
          <div className="font-pixel text-sm mt-2" style={{ color: tierOf(r.next_tier).color }}>
            {r.next_tier > r.tier ? `PROMOTED! ${tierOf(r.next_tier).emoji}` : r.next_tier < r.tier ? "RELEGATED" : "HELD YOUR SPOT"}
          </div>
          <p className="text-sm mt-2">You finished <b>#{r.rank}</b> of {r.size} in the {tierOf(r.tier).name}.{r.gold > 0 && <> +<b style={{ color: "var(--gold)" }}>{r.gold} Gold</b>.</>}</p>
          <div className="flex gap-2 justify-center mt-3">
            {r.next_tier > r.tier && <button className="btn btn-ghost text-xs" onClick={() => void shareCard({ kind: "league", title: `PROMOTED TO THE ${tierOf(r.next_tier).name.toUpperCase()}`, big: tierOf(r.next_tier).emoji, sub: `#${r.rank} of ${r.size} last week`, career: c })}>Share</button>}
            <button className="btn btn-primary text-xs" disabled={busy} onClick={() => void ack()}>Got it</button>
          </div>
        </Card>
      )}

      <Card className="mb-3" style={{ borderColor: t.color, borderWidth: 2 }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{t.emoji}</span>
            <div>
              <div className="font-pixel text-[10px]" style={{ color: t.color }}>{t.name.toUpperCase()}</div>
              <div className="text-[11px] text-muted-fg mt-1">Division {league.tier} of 6 · ends in {resetsIn(league.resets_at)}</div>
            </div>
          </div>
          {me && <div className="text-right"><div className="font-pixel text-lg" style={{ color: t.color }}>#{me.rank}</div><div className="text-[10px] text-muted-fg">{me.score.toLocaleString()} fame</div></div>}
        </div>
        <p className="text-[11px] text-muted-fg mt-3">
          Fame you earn this week counts.{league.up > 0 && <> Top <b className="text-fg">{league.up}</b> move up.</>}{league.down > 0 && <> Bottom <b className="text-fg">{league.down}</b> move down.</>}
          {league.gold_on && <> Top 3 win <b style={{ color: "var(--gold)" }}>{league.gold_per_tier * league.tier * 3} / {league.gold_per_tier * league.tier * 2} / {league.gold_per_tier * league.tier} Gold</b>.</>}
        </p>
      </Card>

      <ol className="space-y-1.5">
        {league.rows.map((row) => {
          const up = league.up > 0 && row.rank <= league.up;
          const down = league.down > 0 && row.rank > league.size - league.down;
          return (
            <li key={row.rank} className="panel px-3 py-2 flex items-center gap-3" style={row.me ? { borderColor: "var(--gold)" } : undefined}>
              <span className="font-pixel text-[10px] w-6" style={{ color: up ? "var(--success)" : down ? "var(--danger)" : "var(--muted-foreground)" }}>{row.rank}</span>
              {row.look ? <Avatar look={normalizeLook(row.look, "pop")} size={32} /> : <span className="w-[22px] text-center">🎵</span>}
              <span className={`flex-1 text-sm truncate ${row.me ? "font-bold" : ""}`}>{row.name}{row.badge ? ` ${row.badge}` : ""}{row.me ? " (you)" : ""}<span className="block text-[10px] text-muted-fg font-normal">LV{row.level}</span></span>
              <span className="text-xs tabular-nums">{row.score.toLocaleString()}</span>
              <span className="w-4 text-center text-xs">{up ? "▲" : down ? "▼" : ""}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-1.5 justify-center mt-4">
        {TIERS.map((x) => <span key={x.tier} className={`text-[10px] px-2 py-1 rounded-full border ${x.tier === league.tier ? "" : "opacity-50"}`} style={{ borderColor: x.color, color: x.color }}>{x.emoji} {x.name.replace(" League", "")}</span>)}
      </div>
    </div>
  );
}
