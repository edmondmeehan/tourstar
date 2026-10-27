import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GENRES, GOSSIP, MAX_ENERGY, PERSONAS, RIVALS } from "../game/data";
import { useConfig } from "../game/config";
import { fmtMoney, levelProgress, moodOf, todayKey } from "../game/engine";
import { useGame } from "../game/store";
import { useMembership } from "../game/settings";
import { Bar, Card, Modal, StatBar, toast } from "../components/ui";
import type { Stats } from "../game/types";

function NewsTicker({ name }: { name: string }) {
  const items = useMemo(() => {
    const pick = () => RIVALS[Math.floor(Math.random() * RIVALS.length)].name;
    return [...GOSSIP].sort(() => Math.random() - 0.5).map((g) => g.replace("{name}", name).replace("{rival}", pick()).replace("{rival2}", pick()));
  }, [name]);
  const line = items.join("   ✦   ");
  return (
    <div className="panel overflow-hidden py-2 mb-4" style={{ borderColor: "var(--neon-pink)" }}>
      <div className="flex items-center">
        <span className="font-pixel text-[8px] px-2 shrink-0" style={{ color: "var(--neon-pink)" }}>GOSSIP</span>
        <div className="overflow-hidden flex-1">
          <div className="whitespace-nowrap animate-ticker text-xs text-fg/80 inline-block">{line}   ✦   {line}</div>
        </div>
      </div>
    </div>
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

      <Card glow="pink" className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold truncate">{c.name}</h2>
              <button aria-label="Rename" className="text-muted-fg hover:text-fg" onClick={() => { setNewName(c.name); setRenaming(true); }}>✏️</button>
            </div>
            <div className="text-xs text-muted-fg mt-1">{GENRES[c.genre].emoji} {GENRES[c.genre].name} · {PERSONAS[c.persona].emoji} {PERSONAS[c.persona].name}</div>
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
        <Link to="/tour" className="btn btn-pink text-center">🚐 Book a gig</Link>
        <Link to="/rivals" className="btn btn-ghost text-center">⚔️ Rivals</Link>
        <Link to="/locker" className="btn btn-ghost text-center">🎧 Locker</Link>
        <Link to="/log" className="btn btn-ghost text-center">📜 Career log</Link>
        <Link to="/releases" className="btn btn-ghost text-center">📀 Releases</Link>
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
