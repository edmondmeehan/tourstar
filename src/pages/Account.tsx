import { COPYRIGHT } from "../lib/site";
import { useVersion } from "../lib/version";
import { available as gcAvailable, openGameCenter, signInGameCenter, useGameCenter } from "../lib/gamecenter";
import { nearestCity, parsePostal, savePostal, usePostal } from "../lib/postal";
import { useEffect, useState } from "react";
import Calibrate from "../components/Calibrate";
import { openTickets } from "../lib/presales";
import { useNavigate } from "react-router-dom";
import { useGame } from "../game/store";
import { useMembership, useSettings } from "../game/settings";
import { GENRES, PERSONAS } from "../game/data";
import { Card, PageTitle, Tag, toast, askConfirm } from "../components/ui";
import { sfx } from "../lib/fx";
import { haptic } from "../lib/haptics";
import { Link } from "react-router-dom";
import { restore } from "../lib/purchases";
import { askNotificationPermission, scheduleReminders, useNotify } from "../lib/notify";
import { disablePush, enablePush } from "../lib/push";
import { isNative } from "../lib/native";
import { cloudConfigured, deleteAccount, resendConfirmation, signOut, supabase, useCloud } from "../lib/cloud";

function CloudCard() {
  const { session, email, pendingEmail, sync, lastSyncedAt, isAdmin } = useCloud();
  const status: Record<string, string> = {
    synced: lastSyncedAt ? `Saved to the cloud · ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Saved to the cloud",
    syncing: "Saving to the cloud…",
    offline: "Offline. Will sync when you're back online.",
    error: "Couldn't reach the cloud. Saved on this device; will retry.",
  };
  if (!cloudConfigured) {
    return <Card className="mb-4"><div className="font-pixel text-[8px] text-muted-fg mb-2">SAVE</div><div className="text-sm">Saved on this device</div></Card>;
  }
  return (
    <Card className="mb-4" glow={session ? undefined : "gold"}>
      <div className="font-pixel text-[8px] text-muted-fg mb-2">ACCOUNT & CLOUD SAVE</div>
      {session ? (
        <>
          <div className="text-sm">Signed in as <b>{email ?? "your account"}</b></div>
          <div className="text-xs mt-1" style={{ color: sync === "synced" ? "var(--success)" : sync === "error" ? "var(--danger)" : "var(--muted-foreground)" }}>{status[sync] ?? ""}</div>
          <div className="flex gap-2 mt-3">
            <Link to="/reset-password" className="btn btn-ghost flex-1 text-center">Change password</Link>
            <button className="btn btn-ghost flex-1" onClick={() => askConfirm("Sign out? Your career stays on this device.", () => void signOut(), { yes: "Sign out" })}>Sign out</button>
          </div>
          {isAdmin && <Link to="/admin" className="btn btn-gold w-full text-center mt-3 block">Open admin</Link>}
          <button className="text-xs text-danger underline mt-4" onClick={() => askConfirm("Delete your account and its cloud save? This can't be undone. Your career stays on this device.", async () => toast(await deleteAccount()), { yes: "Delete account", danger: true })}>Delete account</button>
        </>
      ) : pendingEmail ? (
        <>
          <div className="text-sm">Check <b>{pendingEmail}</b> for a confirmation link. Until then your career saves on this device.</div>
          <div className="flex gap-2 mt-3">
            <button className="btn btn-ghost flex-1" onClick={async () => toast(await resendConfirmation())}>Resend link</button>
            <Link to="/login?mode=signin" className="btn btn-primary flex-1 text-center">Sign in</Link>
          </div>
        </>
      ) : (
        <>
          <div className="text-sm">You're playing as a guest. Your career is only on this device.</div>
          <div className="flex gap-2 mt-3">
            <Link to="/login" className="btn btn-pink flex-1 text-center">Create account</Link>
            <Link to="/login?mode=signin" className="btn btn-ghost flex-1 text-center">Sign in</Link>
          </div>
        </>
      )}
    </Card>
  );
}

function RemindersCard() {
  const { enabled, status, set } = useNotify();
  const toggle = async (on: boolean) => {
    set({ enabled: on });
    if (on && status !== "granted") {
      const ok = await askNotificationPermission();
      if (!ok) toast({ ok: false, message: "Turn on notifications for TourStar in your phone's Settings." });
    }
    void scheduleReminders();
    if (on) void enablePush(); else void disablePush();
  };
  return (
    <Card className="mb-4">
      <label className="flex items-center justify-between text-sm gap-3">
        <span>
          <span className="font-pixel text-[8px] text-muted-fg block mb-1">REMINDERS</span>
          Energy full, royalties ready, streak about to end, new quests, VIP presales and new drops
        </span>
        <input type="checkbox" checked={enabled && status === "granted"} onChange={(e) => void toggle(e.target.checked)} className="w-5 h-5 accent-[var(--neon-pink)] shrink-0" />
      </label>
    </Card>
  );
}

/** Signed-in players: reminder emails when they've been away a few days (on by default, one tap to stop). */
function EmailRemindersCard() {
  const signedIn = useCloud((s) => !!s.session);
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!signedIn || !supabase) return;
    void supabase.from("player_email_prefs").select("winback").maybeSingle().then(({ data, error }) => setOn(error ? null : data ? data.winback !== false : true));
  }, [signedIn]);
  if (!signedIn || on === null) return null;
  const toggle = async (v: boolean) => {
    setOn(v);
    const { error } = await supabase!.rpc("set_winback_emails", { p_on: v });
    if (error) { setOn(!v); toast({ ok: false, message: "Couldn't save that. Try again." }); }
  };
  return (
    <Card className="mb-4">
      <label className="flex items-center justify-between text-sm gap-3">
        <span>
          <span className="font-pixel text-[8px] text-muted-fg block mb-1">EMAIL REMINDERS</span>
          A friendly email if you haven't played in a few days
        </span>
        <input type="checkbox" checked={on} onChange={(e) => void toggle(e.target.checked)} className="w-5 h-5 accent-[var(--neon-pink)] shrink-0" />
      </label>
    </Card>
  );
}

export default function Account() {
  const c = useGame((s) => s.career)!;
  const retire = useGame((s) => s.retire);
  const m = useMembership();
  const s = useSettings();
  const [calib, setCalib] = useState(false);
  const nav = useNavigate();

  return (
    <div>
      <PageTitle title="ACCOUNT" />

      <Card className="mb-4">
        <div className="font-pixel text-[8px] text-muted-fg mb-2">PROFILE</div>
        <div className="font-bold">{c.name} {m.vipBadge && "💎"}</div>
        <div className="text-xs text-muted-fg">{GENRES[c.genre].name} · {PERSONAS[c.persona].name} · started {new Date(c.createdAt).toLocaleDateString()}</div>
        <div className="text-xs text-muted-fg mt-1">Renames used: {c.renameCount} {c.renameCount === 0 && "(next one is free)"}</div>
      </Card>

      <CloudCard />
      <AreaCard />
      <GameCenterCard />

      <Card className="mb-4">
        <div className="font-pixel text-[8px] text-muted-fg mb-2">MEMBERSHIP</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {m.premiumPass ? <Tag color="var(--gold)">👑 VIP</Tag> : <span className="text-sm text-muted-fg">Free player</span>}
        </div>
        <div className="font-pixel text-[8px] text-muted-fg mb-2">PURCHASE HISTORY</div>
        {m.purchases.length ? (
          <ul className="text-xs space-y-1 mb-3">
            {m.purchases.map((p) => (
              <li key={p.id} className="flex justify-between"><span>{p.name}</span><span className="text-muted-fg">${p.price} · {new Date(p.at).toLocaleDateString()}{p.simulated ? " · test" : ""}</span></li>
            ))}
          </ul>
        ) : <p className="text-xs text-muted-fg mb-3">No purchases yet.</p>}
        <button className="btn btn-ghost w-full" onClick={async () => toast(await restore())}>Restore purchases</button>
      </Card>

      <Card className="mb-4 space-y-4">
        <div className="font-pixel text-[8px] text-muted-fg">SOUND &amp; VIBRATION</div>
        <div>
          <div className="flex justify-between text-sm mb-1"><span>Volume</span><span className="text-muted-fg">{Math.round(s.volume * 100)}%</span></div>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => s.set({ volume: Number(e.target.value) })} onMouseUp={() => sfx("click")} onTouchEnd={() => sfx("click")} className="w-full" />
        </div>
        <label className="flex items-center justify-between text-sm">
          <span>Mute</span>
          <input type="checkbox" checked={s.muted} onChange={(e) => s.set({ muted: e.target.checked })} className="w-5 h-5 accent-[var(--neon-pink)]" />
        </label>
        <div>
          <div className="text-sm mb-2">Vibration</div>
          <div className="grid grid-cols-4 gap-2">
            {(["off", "low", "med", "high"] as const).map((v) => (
              <button key={v} onClick={() => { s.set({ vibration: v }); setTimeout(() => haptic("combo"), 0); }} className={`font-pixel text-[8px] py-2 rounded border ${s.vibration === v ? "border-pink text-pink" : "border-line text-muted-fg"}`}>{v.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">Rhythm timing<span className="block text-[11px] text-muted-fg">{s.tapOffsetMs ? `Adjusted ${Math.abs(s.tapOffsetMs)} ms ${s.tapOffsetMs > 0 ? "later" : "earlier"}` : "Not adjusted. Run this if notes feel off, especially with Bluetooth headphones."}</span></div>
          <button className="btn btn-ghost text-xs shrink-0" onClick={() => setCalib(true)}>Timing check</button>
        </div>
      </Card>
      {calib && <Calibrate onClose={() => setCalib(false)} />}

      {isNative && <RemindersCard />}
      <EmailRemindersCard />

      <div className="text-xs text-muted-fg text-center mb-4 space-x-3">
        <a className="underline" href="https://tourstarapp.com/privacy">Privacy</a>
        <a className="underline" href="https://tourstarapp.com/terms">Terms</a>
        <a className="underline" href="https://tourstarapp.com/support">Support</a>
      </div>

      <button className="btn btn-danger w-full mb-6" onClick={() => askConfirm("Reset your career? This can't be undone.", () => { retire(); nav("/create"); }, { yes: "Reset", danger: true })}>Reset career</button>

      <MadeBy />
    </div>
  );
}

const PTY_LOGO = "https://please.co/cdn/shop/files/PTY_Logo_Type_Yellow_WhiteText.png?v=1768929642&width=440";

/** Credit line: made in NYC by Please and Thank You. */
function MadeBy() {
  const ver = useVersion();
  const [logoOk, setLogoOk] = useState(true);
  return (
    <a href="https://please.co" onClick={(e) => { e.preventDefault(); void openTickets("https://please.co"); }} className="block text-center pb-8 pt-2 opacity-90 hover:opacity-100">
      <div className="text-xs text-muted-fg">Made with <span aria-label="love">❤️</span> in New York City</div>
      <div className="text-xs text-muted-fg mt-1">by your friends at</div>
      {logoOk
        ? <img src={PTY_LOGO} alt="Please and Thank You" className="h-10 mx-auto mt-3 object-contain" loading="lazy" onError={() => setLogoOk(false)} />
        : <div className="font-bold mt-2" style={{ color: "var(--gold)" }}>Please and Thank You</div>}
      <div className="text-[10px] text-muted-fg mt-4">{COPYRIGHT}. Prizes fulfilled by Please and Thank You, Inc.</div>
      <div className="text-[10px] text-muted-fg mt-1 opacity-70">{ver.version ? `Version ${ver.version} · Build ${ver.build}` : `Web build ${__BUILD__}`}</div>
    </a>
  );
}

/** Optional zip / postal code: change or remove. */
function AreaCard() {
  const saved = usePostal((s) => s.postal);
  const marketing = usePostal((s) => s.marketing);
  const [v, setV] = useState(saved ?? "");
  const [busy, setBusy] = useState(false);
  const place = saved ? parsePostal(saved) : null;
  const save = async (val: string | null) => { setBusy(true); const r = await savePostal(val); setBusy(false); toast(r); if (r.ok && !val) setV(""); };
  return (
    <Card className="mb-4">
      <div className="font-pixel text-[8px] text-muted-fg mb-2">YOUR AREA (OPTIONAL)</div>
      <p className="text-xs text-muted-fg mb-2">Your zip or postal code helps us show real shows and presales near you. {place ? <>Saved: <b className="text-fg">{place.postal}</b> · near {nearestCity(place).name}.</> : "Not set."}</p>
      <div className="flex gap-2">
        <input value={v} onChange={(e) => setV(e.target.value.slice(0, 10))} placeholder="Zip or postal code" autoComplete="postal-code" className="flex-1 bg-black/40 border border-line rounded px-3 py-2 text-sm" />
        <button className="btn btn-primary !px-4" disabled={busy || !v.trim()} onClick={() => void save(v)}>Save</button>
      </div>
      {saved && (
        <label className="flex items-start gap-2 text-xs mt-3">
          <input type="checkbox" className="mt-0.5" checked={marketing} disabled={busy} onChange={async (e) => { setBusy(true); const r = await savePostal(saved, e.target.checked); setBusy(false); if (r.ok) toast({ ok: true, message: e.target.checked ? "You'll hear about shows and presales near you." : "Local emails turned off." }); }} />
          <span>Email me about real shows, presales and offers near me.</span>
        </label>
      )}
      {saved && <button className="text-xs underline text-muted-fg mt-2 block" disabled={busy} onClick={() => void save(null)}>Remove my postal code</button>}
    </Card>
  );
}

/** Game Center (iPhone): achievements and leaderboards mirrored from TourStar. */
function GameCenterCard() {
  const player = useGameCenter((s) => s.player);
  if (!gcAvailable) return null;
  return (
    <Card className="mb-4">
      <div className="font-pixel text-[8px] text-muted-fg mb-2">GAME CENTER</div>
      {player?.authenticated ? (
        <>
          <p className="text-xs text-muted-fg mb-3">Signed in as <b className="text-fg">{player.alias}</b>. Your achievements, fame and net worth show up in Game Center.</p>
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1 text-xs" onClick={() => openGameCenter("achievements")}>🏅 Achievements</button>
            <button className="btn btn-ghost flex-1 text-xs" onClick={() => openGameCenter("leaderboards")}>🏆 Leaderboards</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-fg mb-3">Optional. Sign in to Game Center to see your TourStar achievements and compare fame and net worth with friends.</p>
          <button className="btn btn-ghost w-full text-xs" onClick={() => void signInGameCenter()}>Sign in to Game Center</button>
          {player?.error && <p className="text-[11px] text-muted-fg mt-2">If nothing happens, open Settings → Game Center on your iPhone and sign in there.</p>}
        </>
      )}
    </Card>
  );
}
