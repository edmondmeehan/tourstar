import { lazy, Suspense, useEffect, useState } from "react";
import { useConcert } from "../concert/useConcert";
import { useLiveCorner } from "../lib/corner";

const ConcertOverlay = lazy(() => import("../concert/ConcertOverlay"));
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useGame } from "../game/store";
import { useMembership } from "../game/settings";
import { fmtMoney, levelFor, levelProgress } from "../game/engine";
import { AnnouncementBanner, AnnouncementPopup, SavePrompt, SyncPill } from "./CloudUI";
import { CelebrationOverlay, EventModal, LockoutOverlay, OutcomeModal } from "./Overlays";
import { sfx } from "../lib/fx";
import { applySkin } from "../game/cosmetics";
import { COPYRIGHT } from "../lib/site";
import RadioBar from "./RadioBar";
import { useRadio } from "../lib/radio";
import Coach, { coachTarget } from "./Coach";
import { useHelpSeen } from "../lib/help";
import { unclaimedCount } from "../game/achievements";
import { GROUPS, groupOf, groupOpen, isNew, openPages, pageOpen, useNav } from "../lib/nav";
import { toast } from "./ui";
import { ONLINE_ONLY, useOnline } from "../lib/offline";

// The ☰ menu only holds help and account; everything else lives in the bottom tabs (see lib/nav.ts).
const MORE = [
  { to: "/how-to-play", label: "How to Play", icon: "❓" },
  { to: "/premium", label: "VIP & Gold", icon: "💎" },
  { to: "/account", label: "Account & Settings", icon: "⚙️" },
];

export function useGameTick() {
  const tick = useGame((s) => s.tick);
  useEffect(() => {
    tick();
    const t = setInterval(tick, 5000);
    const vis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [tick]);
}

export default function Layout() {
  const career = useGame((s) => s.career);
  const vip = useMembership((s) => s.vipBadge);
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const concert = useConcert((s) => s.open);
  const coach = coachTarget(career?.tutorial?.step);
  const radioOn = useRadio((s) => !!s.station && !!s.queue?.length);
  useGameTick();
  const corner = useLiveCorner();
  const helpSeen = useHelpSeen((s) => s.seen);
  // Once Mo's walkthrough is done, nudge new players to How to Play until they've opened it.
  const helpDot = !helpSeen && !career?.tutorial;
  const ready = career ? unclaimedCount(career) : 0;
  const nav = useNavigate();
  const online = useOnline((s) => s.online);
  const offlineBlock = !online ? ONLINE_ONLY[loc.pathname] : undefined;
  const { seen, last, init, visit } = useNav();
  const openKey = career ? openPages(career).join(",") : "";
  useEffect(() => { if (openKey) init(openKey.split(",")); }, [openKey, init]);
  useEffect(() => { setMenu(false); visit(loc.pathname); }, [loc.pathname, visit]);
  const skinKey = JSON.stringify(career?.style?.skin ?? null);
  useEffect(() => { applySkin(JSON.parse(skinKey)); }, [skinKey]);
  if (!career) return <Navigate to="/create" replace />;
  const lvl = levelFor(career.stats.fame);
  const prog = levelProgress(career.stats.fame);
  const here = groupOf(loc.pathname);
  // The tutorial points at a page; light up the tab (and sub-tab) that holds it.
  const coachGroup = coach ? groupOf(coach)?.id : null;

  return (
    <div className={`min-h-screen max-w-md mx-auto relative ${career.tutorial ? "pb-64" : radioOn ? "pb-40" : "pb-24"}`}>
      <header style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }} className="sticky top-0 z-40 backdrop-blur-md bg-[color-mix(in_oklch,var(--background)_80%,transparent)] border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Link to="/dashboard" className="min-w-0">
            <div className="font-pixel text-[10px] truncate" style={{ color: "var(--gold)" }}>
              {career.name} {career.style?.badge && <span>{career.style.badge}</span>} {vip && <span title="VIP">💎</span>}
            </div>
            <div className="font-pixel text-[8px] text-muted-fg mt-1 truncate">{career.style?.title ? <span style={{ color: "var(--neon-pink)" }}>{career.style.title.toUpperCase()} · </span> : null}WEEK {career.week}</div>
          </Link>
          <div className="flex items-center gap-1.5 shrink-0">
            {online ? <SyncPill /> : <span className="font-pixel text-[7px] px-2 py-1.5 rounded bg-black/40 border border-line whitespace-nowrap" style={{ color: "var(--gold)" }} title="No connection: playing offline">✈️ OFFLINE</span>}
            <Link to="/store" aria-label="Store" onClick={() => sfx("click")} className={`font-pixel text-[9px] px-2 py-1 rounded bg-black/40 border ${here?.id === "store" ? "border-[var(--neon-pink)]" : "border-line"}`} style={{ color: "var(--success)" }}>🛍️ {fmtMoney(career.stats.cash)} <span className="text-[7px] opacity-80">STORE</span></Link>
            <span className="font-pixel text-[9px] px-2 py-1 rounded bg-black/40 border border-line" style={{ color: "oklch(85% .17 110)" }}>⚡{career.stats.energy}</span>
            <button aria-label="Menu" aria-expanded={menu} className="relative w-8 h-8 rounded border border-line bg-black/40" onClick={() => { sfx("click"); setMenu((m) => !m); }}>
              ☰{helpDot && !menu && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--neon-pink)] animate-pulse" aria-hidden="true" />}
            </button>
          </div>
        </div>
        <Link to="/summary" className="flex items-center gap-2 mt-2.5" aria-label={`Level ${lvl.level}, ${lvl.name}. ${prog.next ? `${Math.round(prog.pct)}% of the way to ${prog.next.name}` : "Max level"}`}>
          <span className="font-pixel text-[9px] px-1.5 py-1 rounded shrink-0" style={{ background: "var(--gold)", color: "#1a1206" }}>LV{lvl.level}</span>
          <span className="font-pixel text-[8px] shrink-0" style={{ color: "var(--gold)" }}>{lvl.name.toUpperCase()}</span>
          <div className="h-2 flex-1 rounded-full bg-black/50 border border-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${prog.next ? Math.max(2, prog.pct) : 100}%`, background: "linear-gradient(90deg, var(--gold), oklch(85% .17 70))" }} /></div>
          <span className="text-[10px] text-muted-fg shrink-0 tabular-nums">{prog.next ? `${Math.round(prog.pct)}% → LV${prog.next.level}` : "MAX"}</span>
        </Link>
        {menu && <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden="true" />}
        {menu && (
          <nav className="absolute right-3 top-full mt-2 panel p-2 w-60 animate-pop z-50 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 140px)", background: "#0b0b1e", boxShadow: "0 16px 40px #000c" }}>
            {MORE.map((m) => (
              <NavLink key={m.to} to={m.to} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded text-sm ${isActive ? "bg-white/10" : "hover:bg-white/5"}`}>
                <span className="w-5 text-center">{m.icon}</span>
                <span className="flex-1">{m.label}</span>
                {m.to === "/how-to-play" && helpDot && <span className="font-pixel text-[7px] px-1.5 py-0.5 rounded bg-[var(--neon-pink)] text-white">NEW</span>}
              </NavLink>
            ))}
          </nav>
        )}
        {here && (
          <div className="flex gap-1 mt-3 -mx-1 overflow-x-auto no-scrollbar" role="tablist" aria-label={here.label}>
            {here.pages.map((p) => {
              const open = pageOpen(p, career);
              const label = p.to === "/drums" && corner ? corner.title : p.label;
              const active = loc.pathname === p.to;
              const dot = isNew(p.to, career, seen) || (p.to === "/achievements" && ready > 0);
              return (
                <button key={p.to} role="tab" aria-selected={active}
                  onClick={() => { sfx("click"); if (open) nav(p.to); else toast({ ok: false, message: p.hint ?? "Not unlocked yet." }); }}
                  className={`relative shrink-0 font-pixel text-[8px] px-3 py-2 rounded-full border whitespace-nowrap ${active ? "border-[var(--neon-pink)] text-white bg-white/10" : coach === p.to ? "border-[var(--gold)] text-gold animate-pulse" : open ? "border-line text-muted-fg" : "border-line/50 text-muted-fg/50"}`}>
                  {open ? p.icon : "🔒"} {label.toUpperCase()}
                  {dot && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--neon-pink)]" aria-label="new" />}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <main className="px-4 pt-4 animate-slide-up" key={loc.pathname}>
        <AnnouncementBanner />
        {offlineBlock ? (
          <div className="panel p-6 text-center mt-6">
            <div className="text-4xl mb-3">✈️</div>
            <div className="font-pixel text-[10px] mb-3" style={{ color: "var(--gold)" }}>YOU'RE OFFLINE</div>
            <p className="text-sm text-muted-fg mb-5">{offlineBlock} need a connection. Shows, the studio, Drum School and your stats all work offline, and everything syncs when you're back.</p>
            <Link to="/tour" className="btn btn-pink">🎤 Play a show</Link>
          </div>
        ) : <Outlet />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-[color-mix(in_oklch,var(--background)_92%,transparent)] backdrop-blur-md border-t border-line" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-md mx-auto grid grid-cols-4">
          {GROUPS.map((g) => {
            const open = groupOpen(g, career);
            const active = here?.id === g.id;
            const target = last[g.id] && g.pages.some((p) => p.to === last[g.id] && pageOpen(p, career)) ? last[g.id] : g.pages[0].to;
            const dot = open && g.pages.some((p) => isNew(p.to, career, seen) || (p.to === "/achievements" && ready > 0));
            const coached = coachGroup === g.id && !active;
            return (
              <button key={g.id} onClick={() => { sfx("click"); if (!open) return toast({ ok: false, message: g.hint ?? "Not unlocked yet." }); nav(coached && coach ? coach : target); }}
                className={`relative flex flex-col items-center py-2 gap-1 rounded-lg ${active ? "text-pink" : coached ? "text-gold ring-2 ring-[var(--gold)] bg-white/5" : open ? "text-muted-fg" : "text-muted-fg/40"}`}>
                <span className={`text-xl ${active ? "animate-pulse-glow" : coached ? "animate-bounce" : open ? "opacity-70" : "opacity-40 grayscale"}`}>{open ? g.icon : "🔒"}</span>
                <span className="font-pixel text-[8px]">{g.label}</span>
                {dot && <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-[var(--neon-pink)]" aria-label="new" />}
              </button>
            );
          })}
        </div>
      </nav>

      <RadioBar />
      <Coach />
      <EventModal />
      <OutcomeModal />
      <LockoutOverlay />
      <CelebrationOverlay />
      <SavePrompt />
      <AnnouncementPopup />
      {concert && (
        <Suspense fallback={<div className="fixed inset-0 z-[80] bg-black flex flex-col items-center justify-center gap-6"><span className="font-pixel text-[10px] text-gold animate-press-start">LOADING SHOW…</span><span className="absolute bottom-8 text-[10px] text-white/40">{COPYRIGHT}</span></div>}>
          <ConcertOverlay />
        </Suspense>
      )}
    </div>
  );
}
