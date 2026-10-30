import { lazy, Suspense, useEffect, useState } from "react";
import { useConcert } from "../concert/useConcert";
import { useLiveCorner } from "../lib/corner";

const ConcertOverlay = lazy(() => import("../concert/ConcertOverlay"));
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useGame } from "../game/store";
import { useMembership } from "../game/settings";
import { fmtMoney, levelFor } from "../game/engine";
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

const NAV = [
  { to: "/dashboard", label: "Home", icon: "🏠" },
  { to: "/tour", label: "Tour", icon: "🚐" },
  { to: "/album", label: "Album", icon: "💿" },
  { to: "/label", label: "Label", icon: "🏷️" },
  { to: "/management", label: "Crew", icon: "🧑‍🤝‍🧑" },
  { to: "/store", label: "Store", icon: "🛍️" },
  { to: "/summary", label: "Stats", icon: "📊" },
];

// The ☰ menu, grouped by what players come for.
const MORE: { group: string; items: { to: string; label: string; icon: string }[] }[] = [
  { group: "Play", items: [
    { to: "/drums", label: "Drum School", icon: "🥁" },
    { to: "/radio", label: "TourStar Radio", icon: "📻" },
  ] },
  { group: "Compete & friends", items: [
    { to: "/rivals", label: "Leagues & Rivals", icon: "⚔️" },
    { to: "/friends", label: "Friends", icon: "🤝" },
    { to: "/achievements", label: "Achievements & Hall of Fame", icon: "🏅" },
  ] },
  { group: "My artist", items: [
    { to: "/look", label: "My Look", icon: "🧑‍🎤" },
    { to: "/locker", label: "Locker", icon: "🎧" },
    { to: "/releases", label: "Releases", icon: "📀" },
    { to: "/log", label: "Career Log", icon: "📜" },
  ] },
  { group: "News", items: [
    { to: "/press", label: "The Press", icon: "📰" },
    { to: "/distribute", label: "TourStar Monthly", icon: "💿" },
  ] },
  { group: "Help & account", items: [
    { to: "/how-to-play", label: "How to Play", icon: "❓" },
    { to: "/premium", label: "VIP & Gold", icon: "💎" },
    { to: "/account", label: "Account & Settings", icon: "⚙️" },
  ] },
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
  useEffect(() => setMenu(false), [loc.pathname]);
  const skinKey = JSON.stringify(career?.style?.skin ?? null);
  useEffect(() => { applySkin(JSON.parse(skinKey)); }, [skinKey]);
  if (!career) return <Navigate to="/create" replace />;
  const lvl = levelFor(career.stats.fame);

  return (
    <div className={`min-h-screen max-w-md mx-auto relative ${career.tutorial ? "pb-64" : radioOn ? "pb-40" : "pb-24"}`}>
      <header style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }} className="sticky top-0 z-40 backdrop-blur-md bg-[color-mix(in_oklch,var(--background)_80%,transparent)] border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Link to="/dashboard" className="min-w-0">
            <div className="font-pixel text-[10px] truncate" style={{ color: "var(--gold)" }}>
              {career.name} {career.style?.badge && <span>{career.style.badge}</span>} {vip && <span title="VIP">💎</span>}
            </div>
            <div className="font-pixel text-[8px] text-muted-fg mt-1 truncate">{career.style?.title ? <span style={{ color: "var(--neon-pink)" }}>{career.style.title.toUpperCase()} · </span> : null}LV{lvl.level} · {lvl.name.toUpperCase()} · WK {career.week}</div>
          </Link>
          <div className="flex items-center gap-1.5 shrink-0">
            <SyncPill />
            <span className="font-pixel text-[9px] px-2 py-1 rounded bg-black/40 border border-line" style={{ color: "var(--success)" }}>{fmtMoney(career.stats.cash)}</span>
            <span className="font-pixel text-[9px] px-2 py-1 rounded bg-black/40 border border-line" style={{ color: "oklch(85% .17 110)" }}>⚡{career.stats.energy}</span>
            <button aria-label="Menu" aria-expanded={menu} className="relative w-8 h-8 rounded border border-line bg-black/40" onClick={() => { sfx("click"); setMenu((m) => !m); }}>
              ☰{(helpDot || ready > 0) && !menu && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--neon-pink)] animate-pulse" aria-hidden="true" />}
            </button>
          </div>
        </div>
        {menu && <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden="true" />}
        {menu && (
          <nav className="absolute right-3 top-full mt-2 panel p-2 w-60 animate-pop z-50 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 140px)", background: "#0b0b1e", boxShadow: "0 16px 40px #000c" }}>
            {MORE.map((g, gi) => (
              <div key={g.group} className={gi ? "mt-1 pt-1 border-t border-line" : ""}>
                <div className="font-pixel text-[7px] text-muted-fg px-3 pt-2 pb-1 tracking-wider">{g.group.toUpperCase()}</div>
                {g.items.map((m) => (
                  <NavLink key={m.to} to={m.to} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded text-sm ${isActive ? "bg-white/10" : "hover:bg-white/5"}`}>
                    <span className="w-5 text-center">{m.icon}</span>
                    <span className="flex-1">{m.to === "/drums" && corner ? corner.title : m.label}</span>
                    {m.to === "/how-to-play" && helpDot && <span className="font-pixel text-[7px] px-1.5 py-0.5 rounded bg-[var(--neon-pink)] text-white">NEW</span>}
                    {m.to === "/achievements" && ready > 0 && <span className="font-pixel text-[7px] px-1.5 py-0.5 rounded bg-[var(--gold)] text-black">{ready}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        )}
      </header>

      <main className="px-4 pt-4 animate-slide-up" key={loc.pathname}>
        <AnnouncementBanner />
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-[color-mix(in_oklch,var(--background)_92%,transparent)] backdrop-blur-md border-t border-line" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-md mx-auto grid grid-cols-7">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => sfx("click")} className={({ isActive }) => `flex flex-col items-center py-2 gap-1 rounded-lg ${isActive ? "text-pink" : coach === n.to ? "text-gold ring-2 ring-[var(--gold)] bg-white/5" : "text-muted-fg"}`}>
              {({ isActive }) => (
                <>
                  <span className={`text-lg ${isActive ? "animate-pulse-glow" : coach === n.to ? "animate-bounce" : "opacity-70"}`}>{n.icon}</span>
                  <span className="font-pixel text-[7px]">{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
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
