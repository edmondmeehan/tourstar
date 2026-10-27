import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useGame } from "./game/store";
import { useMembership, useSettings } from "./game/settings";
import { hideSplash, initNative } from "./lib/native";
import { startCloud, useCloud } from "./lib/cloud";
import { startLive, useLive } from "./lib/live";
import { startNotifications } from "./lib/notify";
import { startPurchases } from "./lib/purchases";
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
import Premium from "./pages/Premium";
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

  useEffect(() => {
    if (!ready) return;
    hideSplash();
    startCloud((path) => nav(path));
    startLive();
    startNotifications();
    startPurchases();
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
  return (
    <>
      <Routes>
        <Route path="/" element={<Title />} />
        <Route path="/create" element={<Create />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Suspense fallback={<div className="min-h-screen" />}><Admin /></Suspense>} />
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
          <Route path="/premium" element={<Premium />} />
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
