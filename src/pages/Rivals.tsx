import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GENRES, RIVALS } from "../game/data";
import { useCloud } from "../lib/cloud";
import { loadLeaderboard, resetsIn, type Leaderboard } from "../lib/leaderboard";
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

function RivalChart() {
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
    <>
      <p className="text-[11px] text-muted-fg mb-3">Your weekly chart against the industry's fictional artists · resets in {timeToReset()}</p>
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
    </>
  );
}

export default function Rivals() {
  const [tab, setTab] = useState<"players" | "chart">("players");
  return (
    <div>
      <PageTitle title="RIVALS" sub="Real players and industry rivals." />
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(["players", "chart"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? "btn-pink" : "btn-ghost"} !py-2 text-xs`}>{t === "players" ? "🏆 Leaderboard" : "📈 Rival chart"}</button>
        ))}
      </div>
      {tab === "players" ? <PlayerBoard /> : <RivalChart />}
    </div>
  );
}

const GENRE_CHIPS = [{ id: null as string | null, name: "All", emoji: "🌍" }, ...Object.entries(GENRES).map(([id, g]) => ({ id: id as string | null, name: g.name, emoji: g.emoji }))];

function PlayerBoard() {
  const signedIn = useCloud((s) => !!s.session);
  const [board, setBoard] = useState<"week" | "all">("week");
  const [genre, setGenre] = useState<string | null>(null);
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setLb(null); setErr(false);
    loadLeaderboard(board, genre).then(setLb).catch(() => setErr(true));
  }, [board, genre]);
  const unit = board === "week" ? "fame this week" : "fame";

  return (
    <div>
      <div className="flex gap-2 mb-2">
        {(["week", "all"] as const).map((b) => (
          <button key={b} onClick={() => setBoard(b)} className={`flex-1 px-3 py-2 rounded-full border text-xs ${board === b ? "border-pink text-pink bg-black/30" : "border-line text-muted-fg"}`}>{b === "week" ? "This week" : "All-time"}</button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-3">
        {GENRE_CHIPS.map((g) => (
          <button key={g.name} onClick={() => setGenre(g.id)} className={`shrink-0 px-3 py-1.5 rounded-full border text-[11px] ${genre === g.id ? "border-gold text-gold" : "border-line text-muted-fg"}`}>{g.emoji} {g.name}</button>
        ))}
      </div>

      <Card glow="gold" className="mb-4">
        {!signedIn ? (
          <p className="text-sm">Sign in to join the leaderboard. <Link to="/login" className="underline">Sign in</Link></p>
        ) : lb?.me ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-pixel text-[8px] text-muted-fg">YOUR RANK</div>
              <div className="font-pixel text-xl mt-2" style={{ color: "var(--gold)" }}>#{lb.me.rank.toLocaleString()}</div>
            </div>
            <div className="text-right text-xs">
              <div>{lb.me.score.toLocaleString()} {unit}</div>
              <div className="text-muted-fg mt-1">Top {lb.me.pct}% of {lb.total.toLocaleString()}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-fg">{board === "week" ? "Play a show this week to get on the board." : "Earn some fame to get on the board."}</p>
        )}
        {board === "week" && lb && (
          <p className="text-[11px] text-muted-fg mt-3">Resets in {resetsIn(lb.resets_at)}. Top 10 win Gold Records and a badge: #1 also gets the "Weekly Champion" title.</p>
        )}
      </Card>

      {lb && board === "week" && !genre && lb.last_week.length > 0 && (
        <div className="text-[11px] text-muted-fg mb-3">Last week: {lb.last_week.map((w) => `${["🏆", "🥈", "🥉"][w.rank - 1]} ${w.name}`).join("  ·  ")}</div>
      )}

      {err ? <p className="text-sm text-muted-fg text-center py-6">Couldn't load the leaderboard. Check your connection.</p>
        : !lb ? <p className="text-sm text-muted-fg text-center py-6">Loading…</p>
        : lb.rows.length === 0 ? <Card><p className="text-sm text-muted-fg text-center py-4">No one's on this board yet. Be the first.</p></Card>
        : (
          <ol className="space-y-1.5">
            {lb.rows.map((r) => (
              <li key={`${r.rank}-${r.name}`} className="panel px-3 py-2.5 flex items-center gap-3" style={r.me ? { borderColor: "var(--gold)" } : undefined}>
                {r.rank <= 3 ? <span className="w-9 text-xl">{["🏆", "🥈", "🥉"][r.rank - 1]}</span> : <span className="font-pixel text-[10px] w-9 text-muted-fg">#{r.rank}</span>}
                <span className="text-lg">{GENRES[r.genre as keyof typeof GENRES]?.emoji ?? "🎵"}</span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm truncate ${r.me ? "font-bold" : ""}`}>{r.name}{r.badge ? ` ${r.badge}` : ""}{r.me ? " (you)" : ""}</span>
                  <span className="block text-[10px] text-muted-fg">LV{r.level}</span>
                </span>
                <span className="font-pixel text-[9px] text-muted-fg">{r.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}
      <p className="text-[11px] text-muted-fg text-center mt-4">Signed-in players only, shown by artist name. Rewards are in-game items with no cash value.</p>
    </div>
  );
}
