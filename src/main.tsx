import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import App from "./App";
import { Analytics } from "@vercel/analytics/react";
import { Capacitor } from "@capacitor/core";
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/permanent-marker/latin-400.css";
import "./index.css";
import { WEB_BASE } from "./lib/site";

// The hosted single-file preview runs inside a sandboxed frame with no real URL routing.
const Router = import.meta.env.VITE_ROUTER === "memory" ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router {...(Router === BrowserRouter && WEB_BASE ? { basename: WEB_BASE } : {})}>
      <App />
    </Router>
    {/* Vercel Web Analytics: web only (the iPhone/Android apps aren't served by Vercel). */}
    {!Capacitor.isNativePlatform() && import.meta.env.VITE_ROUTER !== "memory" && <Analytics />}
  </StrictMode>,
);
