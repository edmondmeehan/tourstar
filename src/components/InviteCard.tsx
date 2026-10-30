// "Invite friends" card: your code, a share button, how many friends joined, and (in your first week)
// a box to enter a friend's code.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, toast } from "./ui";
import { useCloud } from "../lib/cloud";
import { INVITE_POINTS, INVITED_POINTS, enterInviteCode, inviteText, loadInvite, useInvite } from "../lib/invites";
import { track } from "../lib/analytics";

export default function InviteCard({ compact = false }: { compact?: boolean }) {
  const signedIn = useCloud((s) => !!s.session);
  const inv = useInvite((s) => s.invite);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (signedIn) void loadInvite(); }, [signedIn]);

  if (!signedIn) {
    if (compact) return null;
    return (
      <Card glow="gold" className="mb-4">
        <div className="font-pixel text-[9px] mb-2" style={{ color: "var(--gold)" }}>🎁 INVITE FRIENDS, EARN POINTS</div>
        <p className="text-sm">Get +{INVITE_POINTS} ⭐ for every friend who joins with your code and plays a show. <Link to="/login" className="underline text-electric">Sign in</Link> to get your code.</p>
      </Card>
    );
  }
  if (!inv) return null;

  const share = async () => {
    const text = inviteText(inv.code);
    track("invite_share");
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch (e) { if ((e as { name?: string }).name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast({ ok: true, message: "Invite copied. Paste it anywhere!" }); }
    catch { toast({ ok: true, message: `Your code: ${inv.code.toUpperCase()}` }); }
  };
  const enter = async () => {
    if (code.trim().length < 4) return toast({ ok: false, message: "Enter your friend's invite code." });
    setBusy(true);
    const r = await enterInviteCode(code);
    setBusy(false);
    toast(r);
    if (r.ok) setCode("");
  };

  return (
    <Card glow="gold" className="mb-4">
      <div className="font-pixel text-[9px] mb-2" style={{ color: "var(--gold)" }}>🎁 INVITE FRIENDS, EARN POINTS</div>
      <p className="text-xs text-muted-fg">Friends enter your code in their first week. When they play their first show, you get <b className="text-fg">+{INVITE_POINTS} ⭐</b> and they get <b className="text-fg">+{INVITED_POINTS} ⭐</b>.</p>
      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1 panel px-3 py-2 text-center font-pixel text-sm tracking-widest" aria-label="Your invite code">{inv.code.toUpperCase()}</div>
        <button className="btn btn-gold !px-4" onClick={() => void share()}>Share</button>
      </div>
      <div className="text-[11px] text-muted-fg mt-2">
        {inv.joined ? <>{inv.joined} friend{inv.joined === 1 ? "" : "s"} joined · {inv.rewarded} played a show</> : "No friends yet. Your first invite is the best one."}
        {inv.points > 0 && <> · <span style={{ color: "var(--gold)" }}>+{inv.points.toLocaleString()} ⭐ earned</span></>}
        {inv.bonus_tickets > 0 && <> · <span style={{ color: "var(--electric)" }}>🎟️ {inv.bonus_tickets} bonus raffle ticket{inv.bonus_tickets === 1 ? "" : "s"}</span></>}
      </div>
      {!compact && inv.can_enter_code && (
        <div className="mt-3 pt-3 border-t border-line">
          <div className="text-xs mb-2">Got a friend's code? Enter it this week for +{INVITED_POINTS} ⭐.</div>
          <div className="flex gap-2">
            <input className="flex-1 bg-black/40 border border-line rounded px-3 py-2 text-sm uppercase tracking-widest" value={code} maxLength={12} placeholder="CODE" onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, ""))} />
            <button className="btn btn-primary !px-4" disabled={busy} onClick={() => void enter()}>{busy ? "…" : "Use"}</button>
          </div>
        </div>
      )}
    </Card>
  );
}
