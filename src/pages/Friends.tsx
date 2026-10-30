// Friends & your band: add friends with a 6-letter code, see their week, and play toward a shared
// "festival bill" goal (shows played this week by you and your friends together).
import { useCallback, useEffect, useState } from "react";
import InviteCard from "../components/InviteCard";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Card, PageTitle, askConfirm, toast } from "../components/ui";
import { normalizeLook } from "../game/looks";
import { weekKey } from "../game/engine";
import { useGame } from "../game/store";
import type { GenreId } from "../game/types";
import { useCloud } from "../lib/cloud";
import { addFriend, loadFriends, relTime, removeFriend, type Friends as F } from "../lib/social";
import { track } from "../lib/analytics";

export default function Friends() {
  const signedIn = useCloud((s) => !!s.session);
  const c = useGame((s) => s.career)!;
  const claimFestival = useGame((s) => s.claimFestival);
  const [f, setF] = useState<F | null>(null);
  const [err, setErr] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { setErr(false); loadFriends().then(setF).catch(() => setErr(true)); }, []);
  useEffect(() => { if (signedIn) load(); }, [signedIn, load]);

  if (!signedIn) return (
    <div>
      <PageTitle title="FRIENDS" sub="Play together, climb together." />
      <InviteCard />
      <Card glow="gold"><p className="text-sm">Add friends, see how their week is going and play toward a shared festival bill. <Link to="/login" className="underline text-electric">Sign in</Link> to start.</p></Card>
    </div>
  );

  const add = async () => {
    if (code.trim().length !== 6) return toast({ ok: false, message: "Friend codes are 6 letters and numbers." });
    setBusy(true);
    const r = await addFriend(code);
    setBusy(false);
    toast(r);
    if (r.ok) { setCode(""); track("friend_added"); load(); }
  };

  const invite = async () => {
    if (!f?.code) return;
    const text = `Add me on TourStar! My friend code is ${f.code}. Play free: https://tourstarapp.com`;
    track("friend_invite");
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); toast({ ok: true, message: "Invite copied. Paste it to a friend." }); } catch { toast({ ok: true, message: `Your code: ${f.code}` }); }
  };

  const bill = f?.bill;
  const total = bill ? bill.mine + bill.friends : 0;
  const claimed = c.festival?.week === weekKey() ? c.festival.claimed : 0;
  const goals = bill?.goals ?? [10, 25, 50];

  return (
    <div>
      <PageTitle title="FRIENDS" sub="Play together, climb together." />
      <InviteCard />

      <Card glow="pink" className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-pixel text-[8px] text-muted-fg">YOUR FRIEND CODE</div>
            <div className="font-pixel text-lg mt-2 tracking-widest" style={{ color: "var(--neon-pink)" }}>{f?.code ?? "······"}</div>
          </div>
          <button className="btn btn-pink text-xs" disabled={!f?.code} onClick={() => void invite()}>Invite</button>
        </div>
        <div className="flex gap-2 mt-4">
          <input className="flex-1 px-3 py-2 rounded bg-black/40 border border-line outline-none focus:border-pink text-sm uppercase tracking-widest" maxLength={6} placeholder="Friend's code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          <button className="btn btn-primary text-xs" disabled={busy || code.length !== 6} onClick={() => void add()}>Add</button>
        </div>
      </Card>

      {bill && (
        <Card glow="gold" className="mb-4">
          <div className="font-pixel text-[9px]" style={{ color: "var(--gold)" }}>🎪 FESTIVAL BILL · THIS WEEK</div>
          <p className="text-xs text-muted-fg mt-2">Every show you and your friends play this week counts toward the bill. Everyone who hits a goal claims its reward.</p>
          <div className="mt-3 h-3 rounded bg-black/50 overflow-hidden relative">
            <div className="h-full" style={{ width: `${Math.min(100, (total / goals[goals.length - 1]) * 100)}%`, background: "linear-gradient(90deg, var(--gold), var(--neon-pink))" }} />
          </div>
          <div className="flex justify-between text-[11px] mt-1"><span><b>{total}</b> shows (you {bill.mine}, friends {bill.friends})</span><span>{goals[goals.length - 1]}</span></div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {goals.slice(0, 3).map((g, i) => {
              const reached = total >= g, done = i < claimed, next = i === claimed;
              return (
                <button key={g} className={`btn ${done ? "btn-ghost" : reached && next ? "btn-gold" : "btn-ghost"} !py-2 text-[10px]`} disabled={done || !reached || !next}
                  onClick={() => { const r = claimFestival(i, reached); toast(r); }}>
                  {done ? "✓ " : ""}{g} shows{reached && next && !done ? " · claim" : ""}
                </button>
              );
            })}
          </div>
          {f.rows.length === 0 && <p className="text-[11px] text-muted-fg mt-3">Solo shows count too, but the bill fills much faster with friends.</p>}
        </Card>
      )}

      {err && <p className="text-sm text-muted-fg text-center py-6">Friends aren't set up yet. Check back soon.</p>}
      {f && f.rows.length > 0 && (
        <>
          <h2 className="font-pixel text-[10px] mb-2 text-muted-fg">THIS WEEK</h2>
          <ul className="space-y-2">
            {f.rows.map((r) => (
              <li key={r.code} className="panel p-3 flex items-center gap-3">
                {r.look ? <Avatar look={normalizeLook(r.look, (r.genre ?? "pop") as GenreId)} size={40} /> : <span className="text-2xl">🎵</span>}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{r.name}{r.badge ? ` ${r.badge}` : ""}</div>
                  <div className="text-[11px] text-muted-fg">LV{r.level} · {r.week_gigs} show{r.week_gigs === 1 ? "" : "s"} this week · active {relTime(r.active_at)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs tabular-nums" style={{ color: "var(--gold)" }}>+{r.week_fame.toLocaleString()}</div>
                  <button className="text-[10px] text-muted-fg underline" onClick={() => askConfirm(`Remove ${r.name} from your friends?`, () => { void removeFriend(r.code).then(load); }, { yes: "Remove", danger: true })}>remove</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {f && f.rows.length === 0 && !err && <p className="text-sm text-muted-fg text-center py-6">No friends yet. Share your code to start a band.</p>}
    </div>
  );
}
