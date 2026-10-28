import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeroBackdrop, Logo } from "../components/HeroBackdrop";
import { Confetti } from "../components/Overlays";
import { useGame } from "../game/store";
import { levelFor } from "../game/engine";
import { sfx } from "../lib/fx";

export default function Title() {
  const career = useGame((s) => s.career);
  const nav = useNavigate();
  const [flash, setFlash] = useState(false);

  const start = useCallback(() => {
    if (flash) return;
    setFlash(true);
    sfx("start");
    setTimeout(() => nav(career ? "/dashboard" : "/create"), 450);
  }, [career, nav, flash]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); start(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [start]);

  const score = String(career?.stats.fans ?? 0).padStart(6, "0").slice(-6);
  const lvl = career ? levelFor(career.stats.fame).level : 1;

  return (
    <div className="fixed inset-0 flex justify-center bg-black cursor-pointer select-none" onClick={start} role="button" aria-label="Press start">
      <div className="relative w-full max-w-md h-full overflow-hidden scanlines">
        <HeroBackdrop />
        <Confetti count={50} />
        <div className="hud-corner left-3 top-3 border-l-2 border-t-2" />
        <div className="hud-corner right-3 top-3 border-r-2 border-t-2" />
        <div className="hud-corner left-3 bottom-3 border-l-2 border-b-2" style={{ borderColor: "var(--neon-pink)" }} />
        <div className="hud-corner right-3 bottom-3 border-r-2 border-b-2" style={{ borderColor: "var(--neon-pink)" }} />

        <div style={{ top: "calc(2rem + env(safe-area-inset-top))" }} className="absolute inset-x-8 flex justify-between font-pixel text-[8px] z-10">
          <div style={{ color: "var(--electric)" }}>SCORE<div className="text-[11px] mt-1">{score}</div></div>
          <div className="text-center" style={{ color: "var(--gold)" }}>1P<div className="text-[10px] mt-1">READY</div></div>
          <div className="text-right" style={{ color: "var(--neon-pink)" }}>LVL<div className="text-[11px] mt-1">{String(lvl).padStart(2, "0")}</div></div>
        </div>

        <div className="absolute inset-x-0 top-[24%] flex flex-col items-center z-10 crt-flicker">
          <Logo />
          <div className="font-pixel text-[9px] mt-8 tracking-widest" style={{ color: "#ffb3e6" }}>BASEMENT → SUPERSTAR</div>
          <div className="font-pixel text-[11px] mt-10 animate-press-start text-glow-blue" style={{ color: "#cfe0ff" }}>▶ PRESS START</div>
          {career && <div className="font-pixel text-[8px] mt-6 text-white/60">CONTINUE AS {career.name.toUpperCase()}</div>}
        </div>

        <div className="absolute bottom-10 inset-x-0 text-center font-pixel text-[7px] text-white/40 z-10">
          © 2026 TOURSTAR, LLC · TAP OR PRESS ENTER
        </div>
        {flash && <div className="absolute inset-0 bg-white animate-flash z-20" />}
      </div>
    </div>
  );
}
