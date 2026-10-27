import { useMemo } from "react";

/** Synthwave city skyline drawn in SVG — stands in for the original bg-hero.jpg. */
export function HeroBackdrop({ dim = false }: { dim?: boolean }) {
  const buildings = useMemo(() => {
    const out: { x: number; w: number; h: number; lit: number[] }[] = [];
    let x = 0;
    let seed = 7;
    const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    while (x < 400) {
      const w = 18 + r() * 34;
      const h = 60 + r() * 170 * (Math.abs(200 - x) < 70 ? 1.4 : 1);
      out.push({ x, w, h, lit: Array.from({ length: Math.floor(h / 14) }, () => r()) });
      x += w + 2;
    }
    return out;
  }, []);

  return (
    <div className={`absolute inset-0 overflow-hidden ${dim ? "opacity-40" : ""}`} aria-hidden>
      <svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d0a24" />
            <stop offset="0.35" stopColor="#3a0f55" />
            <stop offset="0.62" stopColor="#c2286f" />
            <stop offset="0.78" stopColor="#ff8a3d" />
            <stop offset="1" stopColor="#1a0b2e" />
          </linearGradient>
          <radialGradient id="moon" cx="0.4" cy="0.4" r="0.6">
            <stop offset="0" stopColor="#ffe9f6" />
            <stop offset="1" stopColor="#c79ad6" />
          </radialGradient>
          <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ff4fd8" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ff4fd8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0b0920" stopOpacity="0" />
            <stop offset="1" stopColor="#0b0920" stopOpacity="1" />
          </linearGradient>
        </defs>
        <rect width="400" height="700" fill="url(#sky)" />
        <circle cx="62" cy="120" r="26" fill="url(#moon)" opacity="0.9" />
        <polygon points="200,470 120,0 170,0" fill="url(#beam)" opacity="0.6" />
        <polygon points="200,470 250,0 300,0" fill="url(#beam)" opacity="0.45" />
        <g transform="translate(0,470)">
          {buildings.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={-b.h} width={b.w} height={b.h + 10} fill={i % 3 ? "#1b0f33" : "#24123f"} />
              {b.lit.map((v, j) =>
                v > 0.55 ? <rect key={j} x={b.x + 4 + (j % 2) * (b.w / 2 - 2)} y={-b.h + 8 + j * 14} width="4" height="5" fill={v > 0.85 ? "#ffd56b" : "#ff7ad9"} opacity="0.85" /> : null,
              )}
            </g>
          ))}
        </g>
        <rect y="470" width="400" height="230" fill="#120a26" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`h${i}`} x1="0" x2="400" y1={480 + i * i * 3.2} y2={480 + i * i * 3.2} stroke="#ff4fd8" strokeOpacity={0.15 + i * 0.03} />
        ))}
        {Array.from({ length: 15 }, (_, i) => (
          <line key={`v${i}`} x1={200} y1={470} x2={-400 + i * 85} y2={700} stroke="#4f8bff" strokeOpacity="0.2" />
        ))}
        <rect y="380" width="400" height="320" fill="url(#fade)" />
      </svg>
    </div>
  );
}

export function Logo({ size = "lg" }: { size?: "lg" | "sm" }) {
  const cls = size === "lg" ? "text-6xl" : "text-2xl";
  return (
    <div className={`font-logo ${cls} -rotate-3 select-none leading-none text-white`} style={{ textShadow: "0 0 18px rgba(255,79,216,.6), 3px 3px 0 #2a0b46" }}>
      TOURST<span style={{ color: "var(--gold)", textShadow: "0 0 18px var(--gold)" }}>★</span>R
    </div>
  );
}
