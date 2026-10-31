import { startOffline, warmAudio } from "./lib/offline";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useGame } from "./game/store";
import { useMembership, useSettings } from "./game/settings";
import { hideSplash, initNative } from "./lib/native";
import { startCloud, syncNow, useCloud } from "./lib/cloud";
import { startLive, useLive } from "./lib/live";
import { startNotifications } from "./lib/notify";
import { startPurchases } from "./lib/purchases";
import { startAi } from "./lib/ai";
import { startGold } from "./lib/gold";
import { startInvites } from "./lib/invites";
import { startPostal } from "./lib/postal";
import { startGameCenter } from "./lib/gamecenter";
import { startPush } from "./lib/push";
import { startLeaderboard } from "./lib/leaderboard";
import { startAnalytics } from "./lib/analytics";
import { loadVersion } from "./lib/version";
import { startSocial } from "./lib/social";
import { loadTourEvent } from "./lib/tourEvent";
import { startPress } from "./lib/press";
import { loadCorner } from "./lib/corner";
import Press from "./pages/Press";
import { OPEN_PATHS, WEB_BASE, refreshSite, useSite, COPYRIGHT } from "./lib/site";
import { ConflictModal } from "./components/CloudUI";
import Login, { AuthCallback, ResetPassword } from "./pages/Login";
import Layout from "./components/Layout";
import { ConfirmHost, Toaster } from "./components/ui";
import Title from "./pages/Title";
import Create from "./pages/Create";
import Dashboard from "./pages/Dashboard";
import Tour from "./pages/Tour";
import Album from "./pages/Album";
import Label from "./pages/Label";
import Crew from "./pages/Crew";
import Store from "./pages/Store";
import Summary from "./pages/Summary";
import Locker from "./pages/Locker";
import Rivals from "./pages/Rivals";
import Releases from "./pages/Releases";
import Log from "./pages/Log";
import Distribute from "./pages/Distribute";
import Radio from "./pages/Radio";
import HowToPlay from "./pages/HowToPlay";
import Friends from "./pages/Friends";
import Achievements from "./pages/Achievements";
import Wealth from "./pages/Wealth";
import LookPage from "./pages/Look";
import DrumSchool from "./pages/DrumSchool";
import Premium from "./pages/Premium";
import Presales from "./pages/Presales";
import Account from "./pages/Account";

/** Saves load asynchronously on device, so wait for all three stores before routing. */
function useHydrated() {
  const stores = [useGame.persist, useSettings.persist, useMembership.persist, useCloud.persist, useLive.persist];
  const [ready, setReady] = useState(() => stores.every((p) => p.hasHydrated()));
  useEffect(() => {
    if (ready) return;
    const check = () => { if (stores.every((p) => p.hasHydrated())) setReady(true); };
    const unsubs = stores.map((p) => p.onFinishHydration(check));
    check();
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return ready;
}

const Admin = lazy(() => import("./admin/Admin"));

export default function App() {
  const ready = useHydrated();
  const nav = useNavigate();
  const location = useLocation();
  const site = useSite();
  const isAdmin = useCloud((s) => s.isAdmin);

  useEffect(() => {
    if (!ready) return;
    hideSplash();
    loadVersion();
    startAnalytics();
    startCloud((path) => nav(path));
    startLive();
    startNotifications();
    startPurchases();
    startOffline(() => void syncNow());
    void warmAudio((useGame.getState().career?.songs ?? []).map((s) => s.audioUrl).filter((u): u is string => !!u));
    startAi();
    startGold();
    startInvites();
    startPostal();
    startGameCenter();
    startLeaderboard();
    startSocial();
    void loadTourEvent();
    startPress();
    void loadCorner();
    startPush((path) => nav(path));
    void refreshSite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    // Android back button: go back inside the app; exit from the title screen.
    initNative(() => {
      if (window.location.pathname === "/") return false;
      nav(-1);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return <div className="min-h-screen bg-bg" />;
  if (WEB_BASE && !OPEN_PATHS.some((p) => location.pathname.startsWith(p)) && !site.webPublic && !isAdmin) {
    return site.loaded ? <ComingSoon /> : <div className="min-h-screen bg-bg" />;
  }
  return (
    <>
      <Routes>
        <Route path="/" element={<Title />} />
        <Route path="/create" element={<Create />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Suspense fallback={<div className="min-h-screen flex items-end justify-center pb-8 text-[10px] text-muted-fg">{COPYRIGHT}</div>}><Admin /></Suspense>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tour" element={<Tour />} />
          <Route path="/album" element={<Album />} />
          <Route path="/label" element={<Label />} />
          <Route path="/management" element={<Crew />} />
          <Route path="/store" element={<Store />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/locker" element={<Locker />} />
          <Route path="/rivals" element={<Rivals />} />
          <Route path="/releases" element={<Releases />} />
          <Route path="/log" element={<Log />} />
          <Route path="/distribute" element={<Distribute />} />
          <Route path="/radio" element={<Radio />} />
          <Route path="/how-to-play" element={<HowToPlay />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/wealth" element={<Wealth />} />
          <Route path="/look" element={<LookPage />} />
          <Route path="/drums" element={<DrumSchool />} />
          <Route path="/press" element={<Press />} />
          <Route path="/premium" element={<Premium />} />
          <Route path="/presales" element={<Presales />} />
          <Route path="/account" element={<Account />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
      <ConfirmHost />
      <ConflictModal />
    </>
  );
}

/** Shown on the web while the game is hidden. The team can still sign in. */
function ComingSoon() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center text-center px-6 gap-5">
      <img src="/brand/tourstar-logo.webp" alt="TourStar" className="w-64 max-w-full" />
      <p className="text-sm text-muted-fg max-w-xs">The game isn't open yet. Join the waitlist for early access.</p>
      <a href="/#join" className="btn btn-pink">Get early access</a>
      <Link to="/login" className="text-[11px] text-muted-fg underline">Team sign in</Link>
      <p className="text-[10px] text-muted-fg mt-6">{COPYRIGHT}</p>
    </div>
  );
}
