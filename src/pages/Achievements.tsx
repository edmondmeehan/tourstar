// Achievements and the Hall of Fame. Legends can retire here: the artist enters the Hall of Fame and the
// next career starts with a lasting fame bonus (+10% per retired Legend, up to +50%).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Card, DeltaChips, PageTitle, askConfirm, toast } from "../components/ui";
import { ACHIEVEMENTS, achievementReward } from "../game/achievements";
import { levelFor } from "../game/engine";
import { normalizeLook } from "../game/looks";
import { useGame } from "../game/store";
import type { GenreId } from "../game/types";
import { useCloud } from "../lib/cloud";
import { enterHall, loadHall, type HallRow } from "../lib/social";
import { shareCard } from "../lib/share";
import { track } from "../lib/analytics";
import { sfx } from "../lib/fx";

export default function Achievements() {
  const c = useGame((s) => s.career)!;
  const claim = useGame((s) => s.claimAchievement);
  const signedIn = useCloud((s) => !!s.session);
  const nav = useNavigate();
  const [hall, setHall] = useState<HallRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void loadHall().then(setHall); }, []);

  const lvl = levelFor(c.stats.fame).level;
  const done = ACHIEVEMENTS.filter((a) => c.achievements?.[a.id]).length;
  const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];
  const legend = c.peakLevel >= 7;

  const retire = () => askConfirm(
    `Retire ${c.name}? They enter the Hall of Fame${signedIn ? "" : " (sign in first to be listed)"}, and you start a new artist with a +${Math.min(50, ((c.legacy?.count ?? 0) + 1) * 10)}% fame bonus. You keep your looks, styles and achievements. Cash, crew and songs stay with ${c.name}.`,
    async () => {
      setBusy(true);
      const r = await enterHall();
      setBusy(false);
      if (!r.ok) return toast(r);
      track("retired", { legacy: (c.legacy?.count ?? 0) + 1 });
      if (r.message) toast({ ok: true, message: r.message });
      nav("/create?legacy=1");
    },
    { yes: "Retire a Legend" },
  );

  return (
    <div>
      <PageTitle title="ACHIEVEMENTS" sub={`${done} of ${ACHIEVEMENTS.length} unlocked`} />
      {c.legacy && (
        <Card className="mb-4"><p className="text-xs">🏛️ Legacy bonus <b style={{ color: "var(--gold)" }}>+{c.legacy.fameBonus}% fame</b> from {c.legacy.names.join(", ")}.</p></Card>
      )}

      {groups.map((g) => (
        <div key={g} className="mb-5">
          <h2 className="font-pixel text-[10px] mb-2 text-muted-fg">{g.toUpperCase()}</h2>
          <ul className="space-y-2">
            {ACHIEVEMENTS.filter((a) => a.group === g).map((a) => {
              const p = Math.min(a.target, a.progress(c));
              const got = !!c.achievements?.[a.id];
              const ready = !got && p >= a.target;
              return (
                <li key={a.id} className={`panel p-3 ${got ? "opacity-60" : ""}`} style={ready ? { borderColor: "var(--gold)" } : undefined}>
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl ${got || ready ? "" : "grayscale opacity-60"}`}>{a.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold">{a.name}</div>
                      <div className="text-[11px] text-muted-fg">{a.about}</div>
                      {!got && a.target > 1 && (
                        <div className="mt-1.5 h-1.5 rounded bg-black/50 overflow-hidden"><div className="h-full" style={{ width: `${(p / a.target) * 100}%`, background: "var(--gold)" }} /></div>
                      )}
                    </div>
                    {got ? <span className="text-xs" style={{ color: "var(--success)" }}>✓</span>
                      : ready ? <button className="btn btn-gold text-[9px] px-3 py-2" onClick={() => { const r = claim(a.id); toast(r); if (r.ok) sfx("levelup"); }}>Claim</button>
                      : <span className="text-[10px] text-muted-fg tabular-nums">{a.target > 1 ? `${p.toLocaleString()}/${a.target.toLocaleString()}` : ""}</span>}
                  </div>
                  {ready && <DeltaChips delta={achievementReward(a, lvl)} className="mt-2" />}
                  {got && a.size === 3 && <button className="text-[10px] underline text-muted-fg mt-1" onClick={() => void shareCard({ kind: "achievement", title: `ACHIEVEMENT: ${a.name.toUpperCase()}`, big: a.emoji, sub: a.about, career: c })}>Share</button>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <h2 className="font-pixel text-[10px] mb-2" style={{ color: "var(--gold)" }}>🏛️ HALL OF FAME</h2>
      <Card glow={legend ? "gold" : undefined} className="mb-3">
        {legend ? (
          <>
            <p className="text-sm">{c.name} is a <b>Legend</b>. Retire them to the Hall of Fame and start a new career with a lasting fame bonus.</p>
            <button className="btn btn-gold w-full mt-3" disabled={busy} onClick={retire}>{busy ? "Retiring…" : "Retire to the Hall of Fame"}</button>
          </>
        ) : <p className="text-xs text-muted-fg">Reach level 7 (Legend) to retire an artist here. Each retired Legend gives your next career +10% fame, up to +50%.</p>}
      </Card>
      {hall && hall.length > 0 ? (
        <ol className="space-y-2">
          {hall.map((h, i) => (
            <li key={`${h.name}-${h.retired_at}`} className="panel p-3 flex items-center gap-3" style={h.me ? { borderColor: "var(--gold)" } : undefined}>
              <span className="font-pixel text-[10px] w-6" style={{ color: i < 3 ? "var(--gold)" : "var(--muted-foreground)" }}>{i + 1}</span>
              {h.look ? <Avatar look={normalizeLook(h.look, (h.genre ?? "pop") as GenreId)} size={36} /> : <span>🎵</span>}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{h.name}{h.me ? " (you)" : ""}</div>
                <div className="text-[11px] text-muted-fg">{h.fame.toLocaleString()} fame · {h.gigs.toLocaleString()} shows · retired {new Date(h.retired_at).toLocaleDateString([], { month: "short", year: "numeric" })}</div>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="text-xs text-muted-fg text-center py-4">No Legends have retired yet. Be the first.{!signedIn && <> <Link className="underline" to="/login">Sign in</Link> to be listed.</>}</p>}
    </div>
  );
}
