// Title screen: a synthwave sunset (retro striped sun setting behind the city, a moving neon grid)
// with the logo across the sun, a framed arcade HUD on top and the start button on the grid floor.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/HeroBackdrop";
import { Avatar } from "../components/Avatar";
import { useGame } from "../game/store";
import { levelFor } from "../game/engine";
import { normalizeLook } from "../game/looks";
import { sfx } from "../lib/fx";
import { useSite } from "../lib/site";
import { seasonFor, type Season } from "../lib/season";

// Scene coordinates (viewBox 400×860, about a phone's shape). The horizon sits at 61%.
const H = 860, HORIZON = 525, SUN_Y = 405, SUN_R = 118;

function Scene({ season: z }: { season: Season }) {
  const city = useMemo(() => {
    const out: City = [];
    let x = -4, seed = 11;
    const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    while (x < 404) {
      const w = 16 + r() * 30;
      const mid = Math.abs(200 - (x + w / 2)) < 95;
      const h = mid ? 26 + r() * 46 : 45 + r() * 120;
      out.push({ x, w, h, lit: Array.from({ length: Math.floor(h / 12) * 2 }, () => r()) });
      x += w + 1.5;
    }
    return out;
  }, []);
  const stars = useMemo(() => {
    let seed = 3;
    const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 46 }, () => ({ x: r() * 400, y: r() * 300, s: r() < 0.15 ? 2 : 1.2, d: 1.5 + r() * 3, o: r() * 3 }));
  }, []);
  // Sun stripes: gaps that get thicker toward the bottom (classic retro sun).
  const gaps = [0.08, 0.2, 0.31, 0.41, 0.5, 0.58, 0.66, 0.73];

  return (
    <svg viewBox={`0 0 400 ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" aria-hidden>
      <defs>
        <linearGradient id="t-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={z.sky[0]} />
          <stop offset="0.3" stopColor={z.sky[1]} />
          <stop offset="0.5" stopColor={z.sky[2]} />
          <stop offset="0.61" stopColor={z.sky[3]} />
          <stop offset="0.611" stopColor="#0a0718" />
          <stop offset="1" stopColor="#05040f" />
        </linearGradient>
        <linearGradient id="t-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={z.sun[0]} />
          <stop offset="0.45" stopColor={z.sun[1]} />
          <stop offset="1" stopColor={z.sun[2]} />
        </linearGradient>
        <radialGradient id="t-glow">
          <stop offset="0.55" stopColor={z.glow} stopOpacity="0.45" />
          <stop offset="1" stopColor={z.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="t-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={z.rung} stopOpacity="0.35" />
          <stop offset="0.08" stopColor={z.rung} stopOpacity="0" />
        </linearGradient>
        <mask id="t-sunmask">
          <rect x="0" y="0" width="400" height={H} fill="white" />
          {gaps.map((g, i) => (
            <rect key={i} x="0" y={SUN_Y + SUN_R * (g * 2 - 0.15)} width="400" height={1.5 + i * 1.6} fill="black" />
          ))}
        </mask>
        <clipPath id="t-above"><rect x="0" y="0" width="400" height={HORIZON} /></clipPath>
      </defs>

      <rect width="400" height={H} fill="url(#t-sky)" />
      {stars.map((s, i) => (
        <rect key={i} x={s.x} y={s.y} width={s.s} height={s.s} fill="#fff">
          <animate attributeName="opacity" values="0.15;0.9;0.15" dur={`${s.d}s`} begin={`-${s.o}s`} repeatCount="indefinite" />
        </rect>
      ))}

      <g clipPath="url(#t-above)">
        <circle cx="200" cy={SUN_Y} r={SUN_R * 1.75} fill="url(#t-glow)" />
        <circle cx="200" cy={SUN_Y} r={SUN_R} fill="url(#t-sun)" mask="url(#t-sunmask)" />
        {/* City silhouette in front of the sun, lower in the middle so the sun shows */}
        {city.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={HORIZON - b.h} width={b.w} height={b.h} fill={i % 3 ? "#120a2a" : "#1a0f38"} />
            <rect x={b.x} y={HORIZON - b.h} width={b.w} height="1.5" fill={z.rung} opacity="0.35" />
            {b.lit.map((v, j) => v > 0.62
              ? <rect key={j} x={b.x + 3 + (j % 2) * (b.w / 2 - 1)} y={HORIZON - b.h + 7 + Math.floor(j / 2) * 12} width="3" height="4" fill={v > 0.88 ? "#ffd56b" : "#ff7ad9"} opacity="0.8" />
              : null)}
          </g>
        ))}
        {z.roof && <Roof kind={z.roof} city={city} />}
      </g>

      {/* Horizon line */}
      <rect x="0" y={HORIZON - 1} width="400" height="2" fill={z.rung} />
      <rect x="0" y={HORIZON - 6} width="400" height="12" fill={z.rung} opacity="0.18" />
      <rect x="0" y={HORIZON} width="400" height={H - HORIZON} fill="url(#t-floor)" />

      {/* Neon grid floor: rails fan out from the vanishing point; rungs roll toward you */}
      {Array.from({ length: 21 }, (_, i) => (
        <line key={`v${i}`} x1="200" y1={HORIZON} x2={-800 + i * 80} y2={H} stroke={z.rail} strokeOpacity="0.35" strokeWidth="1" />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <line key={`h${i}`} x1="0" x2="400" y1={HORIZON} y2={HORIZON} stroke={z.rung} strokeWidth="1.2">
          <animate attributeName="y1" values={`${HORIZON};${H + 10}`} dur="4s" begin={`-${(i * 0.4).toFixed(1)}s`} repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.55 0 1 0.45" />
          <animate attributeName="y2" values={`${HORIZON};${H + 10}`} dur="4s" begin={`-${(i * 0.4).toFixed(1)}s`} repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.55 0 1 0.45" />
          <animate attributeName="stroke-opacity" values="0.1;0.75" dur="4s" begin={`-${(i * 0.4).toFixed(1)}s`} repeatCount="indefinite" />
        </line>
      ))}
      {z.particles && <Particles kind={z.particles} />}
    </svg>
  );
}

type City = { x: number; w: number; h: number; lit: number[] }[];

/** Rooftop decorations: jack-o'-lanterns or holiday string lights. */
function Roof({ kind, city }: { kind: "pumpkins" | "lights"; city: City }) {
  if (kind === "pumpkins") {
    return (
      <>
        {city.filter((_, i) => i % 3 === 1).map((b, i) => {
          const x = b.x + b.w / 2, y = HORIZON - b.h - 5;
          return (
            <g key={i}>
              <ellipse cx={x} cy={y} rx="6" ry="5" fill="#ff7a1a" />
              <rect x={x - 0.8} y={y - 7.5} width="1.6" height="3" fill="#3d7a1f" />
              <polygon points={`${x - 3.5},${y - 1} ${x - 1.5},${y - 1} ${x - 2.5},${y - 2.6}`} fill="#ffe46b" />
              <polygon points={`${x + 1.5},${y - 1} ${x + 3.5},${y - 1} ${x + 2.5},${y - 2.6}`} fill="#ffe46b" />
              <rect x={x - 3} y={y + 1.2} width="6" height="1.2" fill="#ffe46b" />
              <animate attributeName="opacity" values="1;0.75;1" dur={`${1.5 + (i % 3) * 0.4}s`} repeatCount="indefinite" />
            </g>
          );
        })}
      </>
    );
  }
  const colors = ["#ff4f6d", "#7cff6b", "#ffd23f", "#4fb4ff"];
  return (
    <>
      {city.map((b, i) => Array.from({ length: Math.max(1, Math.floor(b.w / 6)) }, (_, j) => (
        <circle key={`${i}-${j}`} cx={b.x + 3 + j * 6} cy={HORIZON - b.h + 2 + (j % 2)} r="1.3" fill={colors[(i + j) % 4]}>
          <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" begin={`-${((i + j) % 4) * 0.45}s`} repeatCount="indefinite" />
        </circle>
      )))}
    </>
  );
}

/** Seasonal weather: bats flying past, falling leaves or snow. */
function Particles({ kind }: { kind: "bats" | "leaves" | "snow" }) {
  const items = useMemo(() => {
    let seed = 17;
    const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const n = kind === "snow" ? 60 : kind === "leaves" ? 18 : 7;
    return Array.from({ length: n }, () => ({ x: r() * 400, y: r() * 400, d: kind === "snow" ? 7 + r() * 8 : kind === "leaves" ? 8 + r() * 7 : 9 + r() * 8, o: r() * 15, s: kind === "bats" ? 1.1 + r() * 0.9 : 0.6 + r() * 0.8, k: r() }));
  }, [kind]);

  if (kind === "bats") {
    return (
      <>
        {items.map((b, i) => (
          <g key={i} opacity="0.95">
            <path d="M0,0 q-4,-5 -9,-2 q3,1 3,4 q-3,-1 -5,1 q5,0 6,2 q2,-3 5,-3 q3,0 5,3 q1,-2 6,-2 q-2,-2 -5,-1 q0,-3 3,-4 q-5,-3 -9,2 z" fill="#0a0612" stroke="#ff7a1a" strokeOpacity="0.35" strokeWidth="0.4" transform={`scale(${b.s})`}>
              <animateTransform attributeName="transform" type="scale" values={`${b.s} ${b.s};${b.s} ${b.s * 0.45};${b.s} ${b.s}`} dur="0.35s" repeatCount="indefinite" />
            </path>
            <animateMotion dur={`${b.d}s`} begin={`-${b.o}s`} repeatCount="indefinite"
              path={`M-30,${250 + b.y * 0.35} C 110,${180 + b.y * 0.3} 290,${420 - b.y * 0.2} 430,${230 + b.y * 0.3}`} />
          </g>
        ))}
      </>
    );
  }
  if (kind === "leaves") {
    const fills = ["#f59e0b", "#c2410c", "#eab308", "#9a3412"];
    return (
      <>
        {items.map((l, i) => (
          <g key={i}>
            <path d="M0,-5 q5,2 0,10 q-5,-8 0,-10 z" fill={fills[i % 4]} opacity="0.85" transform={`scale(${l.s})`}>
              <animateTransform attributeName="transform" type="rotate" values="0;180;360" dur={`${2 + l.k * 2}s`} repeatCount="indefinite" additive="sum" />
            </path>
            <animateMotion dur={`${l.d}s`} begin={`-${l.o}s`} repeatCount="indefinite"
              path={`M${l.x},-20 C ${l.x + 40},150 ${l.x - 40},350 ${l.x + 20},560`} />
          </g>
        ))}
      </>
    );
  }
  return (
    <>
      {items.map((f, i) => (
        <circle key={i} r={0.8 + f.s * 1.2} fill="#ffffff" opacity={0.5 + f.k * 0.4}>
          <animateMotion dur={`${f.d}s`} begin={`-${f.o}s`} repeatCount="indefinite" path={`M${f.x},-10 C ${f.x + 15},300 ${f.x - 15},600 ${f.x + 10},${H + 10}`} />
        </circle>
      ))}
    </>
  );
}

function HudCell({ label, value, color, align }: { label: string; value: string; color: string; align: "left" | "center" | "right" }) {
  return (
    <div className={`flex-1 px-3 py-2 ${align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center"}`}>
      <div className="font-pixel text-[7px] tracking-widest text-white/50">{label}</div>
      <div className="font-pixel text-[11px] mt-1.5 tabular-nums" style={{ color, textShadow: `0 0 10px ${color}` }}>{value}</div>
    </div>
  );
}

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

  const setting = useSite((s) => s.season);
  const season = useMemo(() => seasonFor(new Date(), setting), [setting]);
  const fans = String(career?.stats.fans ?? 0).padStart(6, "0").slice(-6);
  const lvl = career ? levelFor(career.stats.fame) : null;

  return (
    <div className="fixed inset-0 flex justify-center bg-[#05040f] cursor-pointer select-none" onClick={start} role="button" aria-label="Press start">
      <div className="relative w-full max-w-md h-full overflow-hidden scanlines">
        <Scene season={season} />

        {/* Arcade HUD, framed */}
        <div className="absolute inset-x-4 z-10" style={{ top: "calc(14px + env(safe-area-inset-top))" }}>
          <div className="flex items-stretch rounded-md border divide-x divide-white/10 backdrop-blur-sm"
            style={{ borderColor: "rgba(79,139,255,.45)", background: "linear-gradient(180deg, rgba(20,12,48,.75), rgba(8,6,20,.55))", boxShadow: "0 0 18px rgba(79,139,255,.18), inset 0 1px 0 rgba(255,255,255,.06)" }}>
            <HudCell label="FANS" value={fans} color="#4fb4ff" align="left" />
            <HudCell label={career ? "PLAYER 1" : "INSERT"} value={career ? "READY" : "COIN"} color="#f2c230" align="center" />
            <HudCell label="LEVEL" value={String(lvl?.level ?? 1).padStart(2, "0")} color="#ff4fd8" align="right" />
          </div>
        </div>

        {/* Logo across the top of the sun */}
        <div className="absolute inset-x-0 z-10 flex flex-col items-center" style={{ top: "26%" }}>
          <div className="crt-flicker"><Logo /></div>
          <div className="font-pixel text-[8px] mt-4 tracking-[0.3em] px-3 py-1.5 rounded-sm" style={{ color: "#ffe9f6", background: "rgba(5,4,15,.55)", textShadow: "0 0 8px #ff4fd8" }}>
            BASEMENT <span style={{ color: "#f2c230" }}>→</span> SUPERSTAR
          </div>
          {season.badge && (
            <div className="font-pixel text-[8px] mt-2 tracking-[0.25em] px-2.5 py-1 rounded-sm border" style={{ color: season.sun[0], borderColor: `${season.glow}88`, background: "rgba(5,4,15,.6)", textShadow: `0 0 8px ${season.glow}` }}>
              {season.badge}
            </div>
          )}
        </div>

        {/* On the grid floor: start, and who you're playing as */}
        <div className="absolute inset-x-0 z-10 flex flex-col items-center gap-5 px-8" style={{ top: "67%" }}>
          <div className="relative">
            <div className="absolute -inset-3 rounded-lg blur-xl opacity-70 animate-pulse" style={{ background: "radial-gradient(closest-side, #ff4fd8, transparent)" }} />
            <div className="relative font-pixel text-[12px] tracking-widest px-7 py-4 rounded-md border-2"
              style={{ color: "#fff", borderColor: "#ff4fd8", background: "linear-gradient(180deg, rgba(255,79,216,.22), rgba(20,8,40,.85))", boxShadow: "0 0 22px rgba(255,79,216,.55), inset 0 0 14px rgba(255,79,216,.25)", textShadow: "0 0 10px #ff4fd8" }}>
              <span className="animate-press-start">▶</span> PRESS START
            </div>
          </div>

          {career && lvl && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-md border"
              style={{ borderColor: "rgba(242,194,48,.45)", background: "rgba(8,6,20,.72)", boxShadow: "0 0 14px rgba(242,194,48,.15)" }}>
              <div className="w-8 h-10 flex items-end justify-center overflow-hidden"><Avatar look={normalizeLook(career.look, career.genre)} size={40} /></div>
              <div className="text-left">
                <div className="font-pixel text-[7px] tracking-widest text-white/50">CONTINUE AS</div>
                <div className="font-pixel text-[10px] mt-1" style={{ color: "#f2c230" }}>{career.name.toUpperCase()}</div>
                <div className="text-[10px] text-white/60 mt-0.5">LV{lvl.level} · {lvl.name}</div>
              </div>
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 z-10 text-center font-pixel text-[7px] text-white/35" style={{ bottom: "calc(18px + env(safe-area-inset-bottom))" }}>
          © 2026 TOURSTAR, LLC · TAP ANYWHERE
        </div>
        {flash && <div className="absolute inset-0 bg-white animate-flash z-20" />}
      </div>
    </div>
  );
}
