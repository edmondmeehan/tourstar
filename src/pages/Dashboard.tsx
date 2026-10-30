import { LUXURIES } from "../game/economy";
import { PresalesTeaser } from "./Presales";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GENRES, GOSSIP, MAX_ENERGY, PERSONAS, RIVALS } from "../game/data";
import { useConfig } from "../game/config";
import { fmtMoney, levelProgress, moodOf, todayKey } from "../game/engine";
import { useGame } from "../game/store";
import { useMembership } from "../game/settings";
import { Bar, Card, Modal, StatBar, toast } from "../components/ui";
import type { Career, Stats } from "../game/types";
import { EventCard, OfferCard } from "../components/Engage";
import { tierOf, useLeague } from "../lib/social";
import { unclaimedCount } from "../game/achievements";
import { ALL_QUESTS_BONUS, ROYALTY_CAP_HOURS, currentQuests, questEmoji, questLabel, royaltiesPending, royaltyRate } from "../game/quests";
import { sfx } from "../lib/fx";
import { useMyRank } from "../lib/leaderboard";
import { Avatar } from "../components/Avatar";
import { normalizeLook } from "../game/looks";
import { usePress } from "../lib/press";

function untilMidnight(now: number) {
  const d = new Date(now); d.setHours(24, 0, 0, 0);
  const ms = d.getTime() - now;
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function QuestsCard({ c, now }: { c: Career; now: number }) {
  const claimQuest = useGame((s) => s.claimQuest);
  const q = currentQuests(c);
  const done = q.list.filter((x) => x.claimed).length;
  return (
    <Card className="mb-4" glow={q.list.some((x) => !x.claimed && x.progress >= x.target) ? "gold" : undefined}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-pixel text-[10px]" style={{ color: "var(--electric)" }}>TODAY'S QUESTS</div>
        <div className="text-[11px] text-muted-fg">New in {untilMidnight(now)}</div>
      </div>
      <ul className="space-y-3">
        {q.list.map((it, i) => {
          const ready = !it.claimed && it.progress >= it.target;
          return (
            <li key={i} className="flex items-center gap-3">
              <span className="text-xl w-7 text-center shrink-0">{it.claimed ? "✅" : questEmoji(it)}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${it.claimed ? "line-through text-muted-fg" : ""}`}>{questLabel(it)}</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1.5 flex-1 rounded bg-black/40 overflow-hidden"><div className="h-full rounded" style={{ width: `${(it.progress / it.target) * 100}%`, background: it.claimed ? "var(--success)" : "var(--electric)" }} /></div>
                  <span className="text-[10px] tabular-nums text-muted-fg shrink-0">{it.progress}/{it.target}</span>
                </div>
              </div>
              {ready ? (
                <button className="btn btn-gold text-[9px] px-3 py-2 shrink-0" onClick={() => { const r = claimQuest(i); toast(r); if (r.ok) sfx("coin", "success"); }}>+{it.points} ⭐</button>
              ) : (
                <span className="font-pixel text-[8px] shrink-0" style={{ color: it.claimed ? "var(--success)" : "var(--gold)" }}>{it.claimed ? "DONE" : `+${it.points} ⭐`}</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="text-[11px] text-muted-fg mt-3">{done === 3 ? (q.bonusClaimed ? "All done today. Come back tomorrow for new quests." : "") : `Finish all three for +${ALL_QUESTS_BONUS} bonus points.`}</div>
    </Card>
  );
}

function RoyaltiesCard({ c, now }: { c: Career; now: number }) {
  const collect = useGame((s) => s.collectRoyalties);
  if (!c.releases.length) return null;
  const p = royaltiesPending(c, now);
  const perHour = Math.round(royaltyRate(c));
  return (
    <Card className="mb-4" glow={p.full ? "gold" : undefined}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-pixel text-[10px]" style={{ color: "var(--success)" }}>ROYALTIES</div>
          <div className="font-pixel text-[13px] mt-2 tabular-nums" style={{ color: "var(--success)" }}>{fmtMoney(p.cash)}</div>
          <div className="text-[11px] text-muted-fg mt-1">
            {c.releases.length} release{c.releases.length === 1 ? "" : "s"} earning ~{fmtMoney(perHour)}/hr · {p.full ? `full (${ROYALTY_CAP_HOURS}h max). Collect to keep earning!` : `fills in ${Math.ceil(ROYALTY_CAP_HOURS - p.hours)}h`}
          </div>
          <div className="h-1.5 rounded bg-black/40 overflow-hidden mt-2"><div className="h-full rounded" style={{ width: `${(p.hours / ROYALTY_CAP_HOURS) * 100}%`, background: "var(--success)" }} /></div>
        </div>
        <button className="btn btn-gold shrink-0" disabled={p.cash < 1} onClick={() => { const r = collect(); toast(r); if (r.ok) sfx("coin", "collect"); }}>Collect</button>
      </div>
    </Card>
  );
}

function NewsTicker({ name }: { name: string }) {
  const press = usePress((s) => s.items);
  const items = useMemo(() => {
    const pick = () => RIVALS[Math.floor(Math.random() * RIVALS.length)].name;
    const ai = press.filter((x) => x.kind === "story" || x.kind === "review").slice(0, 5).map((x) => `${x.outlet ? `${x.outlet}: ` : ""}${x.headline}`);
    return [...ai, ...[...GOSSIP].sort(() => Math.random() - 0.5).map((g) => g.replace("{name}", name).replace("{rival}", pick()).replace("{rival2}", pick()))];
  }, [name, press]);
  const line = items.join("   ✦   ");
  const hasPress = press.some((x) => x.kind === "story" || x.kind === "review");
  return (
    <Link to="/press" className="panel overflow-hidden py-2 mb-4 block" style={{ borderColor: "var(--neon-pink)" }} aria-label="Open The Press">
      <div className="flex items-center">
        <span className="font-pixel text-[8px] px-2 shrink-0" style={{ color: "var(--neon-pink)" }}>{hasPress ? "PRESS" : "GOSSIP"}</span>
        <div className="overflow-hidden flex-1">
          <div className="whitespace-nowrap animate-ticker text-xs text-fg/80 inline-block">{line}   ✦   {line}</div>
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const c = useGame((s) => s.career)!;
  const { claimDaily, rest, rename } = useGame();
  const removeTimers = useMembership((s) => s.removeTimers);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(c.name);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { cur, next, pct } = levelProgress(c.stats.fame);
  const mood = moodOf(c.stats);
  const claimed = c.daily.lastClaim === todayKey();
  const config = useConfig((s) => s.config);
  const interval = config.energyRegenSeconds * 1000 * (removeTimers ? 0.5 : 1);
  const nextEnergy = Math.max(0, Math.ceil((c.lastEnergyTick + interval - now) / 1000));
  const keys: (keyof Stats)[] = ["credibility", "hype", "health", "relationships", "energy"];

  return (
    <div>
      <NewsTicker name={c.name} />

      <Link to="/tour" className="block mb-4" onClick={() => sfx("click")}>
        <Card glow="pink" className="flex items-center gap-4">
          <div className="text-4xl">🎤</div>
          <div className="flex-1 min-w-0">
            <div className="font-pixel text-[10px]" style={{ color: "var(--neon-pink)" }}>PLAY YOUR NEXT SHOW</div>
            <div className="text-xs text-muted-fg mt-2">⚡ {c.stats.energy} energy · {c.totals.gigs === 0 ? "your first gig is waiting" : `${c.totals.gigs} show${c.totals.gigs === 1 ? "" : "s"} played`}</div>
          </div>
          <span className="btn btn-pink text-[9px] px-3 py-2 shrink-0">GO ›</span>
        </Card>
      </Link>

      <Card glow="pink" className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <Link to="/look" className="shrink-0 -my-1 relative" aria-label="Edit your look">
            <Avatar look={normalizeLook(c.look, c.genre)} size={72} />
            <span className="absolute -bottom-1 -right-1 text-[10px] bg-black/70 rounded-full px-1">✏️</span>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold truncate">{c.name}</h2>
              <button aria-label="Rename" className="text-muted-fg hover:text-fg" onClick={() => { setNewName(c.name); setRenaming(true); }}>✏️</button>
            </div>
            <div className="text-xs text-muted-fg mt-1">{GENRES[c.genre].emoji} {GENRES[c.genre].name} · {PERSONAS[c.persona].emoji} {PERSONAS[c.persona].name}</div>
            {!!c.luxury?.length && <div className="text-base mt-1" title="Lifestyle">{LUXURIES.filter((l) => c.luxury!.includes(l.id)).map((l) => <span key={l.id} title={l.name}>{l.emoji}</span>)}</div>}
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl">{mood.emoji}</div>
            <div className="font-pixel text-[8px] mt-1" style={{ color: "var(--gold)" }}>{mood.label.toUpperCase()}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between font-pixel text-[9px] mb-2">
            <span style={{ color: "var(--gold)" }}>LV{cur.level} {cur.name.toUpperCase()}</span>
            <span className="text-muted-fg">{next ? `${c.stats.fame.toLocaleString()} / ${next.fame.toLocaleString()} ★` : "MAX"}</span>
          </div>
          <Bar pct={pct} color="var(--gold)" />
          {next && <div className="text-[11px] text-muted-fg mt-2">Next: {next.name} — unlocks bigger tours & crew.</div>}
        </div>
        <p className="text-xs text-muted-fg mt-3 italic">{mood.tip}</p>
      </Card>

      <EventCard compact />
      <OfferCard compact />
      <LeagueCard />
      <AchievementsNudge c={c} />
      <PresalesTeaser />
      <QuestsCard c={c} now={now} />
      <RoyaltiesCard c={c} now={now} />

      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { l: "FAME", v: c.stats.fame.toLocaleString(), col: "var(--gold)" },
          { l: "FANS", v: c.stats.fans.toLocaleString(), col: "oklch(75% .2 300)" },
          { l: "CASH", v: fmtMoney(c.stats.cash), col: "var(--success)" },
        ].map((x) => (
          <div key={x.l} className="panel p-3 text-center">
            <div className="font-pixel text-[8px] text-muted-fg">{x.l}</div>
            <div className="font-pixel text-[11px] mt-2 truncate" style={{ color: x.col }}>{x.v}</div>
          </div>
        ))}
      </div>

      <Card className="mb-4 space-y-3">
        {keys.map((k) => <StatBar key={k} k={k} value={c.stats[k]} />)}
        <div className="text-[11px] text-muted-fg">
          {c.stats.energy >= MAX_ENERGY ? "Energy full." : `+1 energy in ${nextEnergy}s${removeTimers ? " (2× speed)" : ""}`}
        </div>
      </Card>

      <Card glow={claimed ? undefined : "gold"} className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-pixel text-[10px]" style={{ color: "var(--gold)" }}>DAILY REWARD</div>
            <div className="text-xs text-muted-fg mt-2">Streak: <b className="text-fg">{c.daily.streak} day{c.daily.streak === 1 ? "" : "s"}</b> · Best {c.daily.best}</div>
            <div className="flex gap-1 mt-2">
              {[3, 7, 14, 30].map((d) => (
                <span key={d} className="font-pixel text-[7px] px-1.5 py-1 rounded border" style={{ borderColor: c.daily.streak >= d ? "var(--gold)" : "var(--border)", color: c.daily.streak >= d ? "var(--gold)" : "var(--muted-foreground)" }}>{d}D</span>
              ))}
            </div>
          </div>
          <button className="btn btn-gold" disabled={claimed} onClick={() => toast(claimDaily())}>{claimed ? "Claimed" : "Claim"}</button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button className="btn btn-primary" onClick={() => toast(rest())}>🛋️ Week off</button>
        <Link to="/album" className="btn btn-ghost text-center">💿 Make music</Link>
      </div>

      <Modal open={renaming} onClose={() => setRenaming(false)}>
        <h3 className="font-pixel text-xs mb-3" style={{ color: "var(--gold)" }}>RENAME ARTIST</h3>
        <p className="text-xs text-muted-fg mb-3">{c.renameCount === 0 ? "Your first rename is free." : `Rebranding costs ${fmtMoney(config.renameCost)} in game cash.`}</p>
        <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value.slice(0, 24))} className="w-full px-3 py-2 rounded bg-black/50 border border-line outline-none focus:border-pink mb-4" />
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setRenaming(false)}>Cancel</button>
          <button className="btn btn-pink flex-1" onClick={() => { const r = rename(newName); toast(r); if (r.ok) setRenaming(false); }}>
            {c.renameCount === 0 ? "Rename" : `Pay ${fmtMoney(config.renameCost)}`}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/** Your weekly league (or, before leagues load, your leaderboard rank). */
function LeagueCard() {
  const league = useLeague((s) => s.league);
  if (!league?.joined) return <RankCard />;
  const t = tierOf(league.tier);
  const me = league.rows.find((r) => r.me);
  if (!me) return <RankCard />;
  const cut = league.up ? league.rows[league.up - 1] : null;
  const zone = league.up && me.rank <= league.up ? "▲ in a promotion spot" : league.down && me.rank > league.size - league.down ? "▼ in the relegation zone" : cut ? `${(cut.score - me.score + 1).toLocaleString()} fame to move up` : "";
  return (
    <Link to="/rivals" className="block mb-4">
      <Card className="flex items-center gap-3" style={{ borderColor: t.color }}>
        <div className="text-2xl">{t.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[8px]" style={{ color: t.color }}>{t.name.toUpperCase()}{league.result ? " · RESULTS ARE IN" : ""}</div>
          <div className="text-sm mt-1"><b>#{me.rank}</b> of {league.size} · {zone}</div>
        </div>
        <span className="text-xs text-muted-fg">›</span>
      </Card>
    </Link>
  );
}

function AchievementsNudge({ c }: { c: Career }) {
  const n = unclaimedCount(c);
  if (!n) return null;
  return (
    <Link to="/achievements" className="block mb-4">
      <Card glow="gold" className="flex items-center gap-3">
        <div className="text-2xl">🏅</div>
        <div className="flex-1 text-sm"><b>{n} achievement{n === 1 ? "" : "s"}</b> ready to claim</div>
        <span className="text-xs text-muted-fg">›</span>
      </Card>
    </Link>
  );
}

/** Your weekly leaderboard rank (signed-in players on the board). */
function RankCard() {
  const { rank, pct, score } = useMyRank();
  if (!rank) return null;
  return (
    <Link to="/rivals" className="block mb-4">
      <Card className="flex items-center gap-3">
        <div className="text-2xl">🏆</div>
        <div className="flex-1">
          <div className="font-pixel text-[8px]" style={{ color: "var(--gold)" }}>YOUR RANK THIS WEEK</div>
          <div className="text-sm mt-1"><b>#{rank.toLocaleString()}</b> · top {pct}% · {score.toLocaleString()} fame</div>
        </div>
        <span className="text-xs text-muted-fg">›</span>
      </Card>
    </Link>
  );
}
