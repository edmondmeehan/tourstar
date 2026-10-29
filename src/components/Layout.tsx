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

const NAV = [
  { to: "/dashboard", label: "Home", icon: "🏠" },
  { to: "/tour", label: "Tour", icon: "🚐" },
  { to: "/album", label: "Album", icon: "💿" },
  { to: "/label", label: "Label", icon: "🏷️" },
  { to: "/management", label: "Crew", icon: "🧑‍🤝‍🧑" },
  { to: "/store", label: "Store", icon: "🛍️" },
  { to: "/summary", label: "Stats", icon: "📊" },
];

const MORE = [
  { to: "/locker", label: "Locker", icon: "🎧" },
  { to: "/rivals", label: "Rivals", icon: "⚔️" },
  { to: "/releases", label: "Releases", icon: "📀" },
  { to: "/log", label: "Career Log", icon: "📜" },
  { to: "/look", label: "My Look", icon: "🧑‍🎤" },
  { to: "/press", label: "The Press", icon: "📰" },
  { to: "/drums", label: "Drum School", icon: "🥁" },
  { to: "/how-to-play", label: "How to Play", icon: "❓" },
  { to: "/radio", label: "TourStar Radio", icon: "📻" },
  { to: "/distribute", label: "TourStar Monthly", icon: "💿" },
  { to: "/premium", label: "Premium", icon: "💎" },
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
            <button aria-label="More" className="w-8 h-8 rounded border border-line bg-black/40" onClick={() => { sfx("click"); setMenu((m) => !m); }}>☰</button>
          </div>
        </div>
        {menu && (
          <nav className="absolute right-3 top-full mt-2 panel p-2 w-56 animate-pop z-50">
            {MORE.map((m) => (
              <NavLink key={m.to} to={m.to} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded text-sm ${isActive ? "bg-white/10" : "hover:bg-white/5"}`}>
                <span>{m.icon}</span>{m.to === "/drums" && corner ? corner.title : m.label}
              </NavLink>
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
