// Touring cities UI: the "where you are" bar on the Tour page, the travel map/list, and the hometown picker.
import { useMemo, useState } from "react";
import { nearestCity, parsePostal, usePostal } from "../lib/postal";
import { Link } from "react-router-dom";
import { CITIES, REGIONS, cityById, cityDraw, distanceKm, drawLabel, recentPlays, regionOpen, travelCost, type City } from "../game/cities";
import { fmtMoney, fmtNum, levelFor } from "../game/engine";
import { useGame } from "../game/store";
import { GENRES } from "../game/data";
import { ownedRegions, useGold } from "../lib/gold";
import { Modal, toast } from "./ui";
import { useEnergySheet } from "./KeepPlaying";
import { sfx } from "../lib/fx";

/** Simple world map: city dots placed by latitude/longitude. */
function MiniMap({ here, home, onPick, open }: { here: string; home?: string; onPick: (id: string) => void; open: (c: City) => boolean }) {
  const W = 360, H = 180;
  const x = (lon: number) => ((lon + 170) / 360) * W;
  const y = (lat: number) => ((75 - lat) / 135) * H;
  const cur = cityById(here);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-black/40 border border-line mb-3" role="img" aria-label="Tour map">
      {[...Array(7)].map((_, i) => <line key={`v${i}`} x1={(i * W) / 6} y1={0} x2={(i * W) / 6} y2={H} stroke="rgba(255,255,255,.05)" />)}
      {[...Array(4)].map((_, i) => <line key={`h${i}`} x1={0} y1={(i * H) / 3} x2={W} y2={(i * H) / 3} stroke="rgba(255,255,255,.05)" />)}
      {CITIES.map((c) => {
        const isHere = c.id === here, ok = open(c);
        return (
          <g key={c.id} onClick={() => ok && onPick(c.id)} style={{ cursor: ok ? "pointer" : "default" }}>
            {cur && isHere && <circle cx={x(c.lon)} cy={y(c.lat)} r={7} fill="none" stroke="var(--neon-pink)" strokeWidth={1.5} className="animate-pulse" />}
            <circle cx={x(c.lon)} cy={y(c.lat)} r={isHere ? 3.5 : 2.5} fill={isHere ? "var(--neon-pink)" : c.id === home ? "var(--gold)" : ok ? "var(--electric)" : "rgba(255,255,255,.25)"} />
          </g>
        );
      })}
    </svg>
  );
}

export function CityPicker({ onClose }: { onClose: () => void }) {
  const c = useGame((s) => s.career)!;
  const travel = useGame((s) => s.travel);
  useGold((s) => s.owned);
  const owned = ownedRegions();
  const here = cityById(c.city ?? c.hometown)!;
  const lvl = levelFor(c.stats.fame).level;
  const [sel, setSel] = useState<string | null>(null);
  const isOpen = (city: City) => regionOpen(city.region, owned);
  const go = (id: string) => {
    const r = travel(id, owned);
    if (!r.ok && /energy/.test(r.message)) { const cost = travelCost(here, cityById(id)!, lvl); onClose(); useEnergySheet.getState().open(cost.energy); return; }
    toast(r);
    if (r.ok) { sfx("click"); onClose(); }
  };
  const sorted = useMemo(() => REGIONS.map((reg) => ({ reg, cities: CITIES.filter((x) => x.region === reg.id).sort((a, b) => distanceKm(here, a) - distanceKm(here, b)) })), [here]);

  return (
    <Modal open onClose={onClose}>
      <div className="font-pixel text-[10px] mb-1" style={{ color: "var(--gold)" }}>🌍 WHERE TO NEXT?</div>
      <p className="text-xs text-muted-fg mb-3">You're in <b className="text-fg">{here.name}</b>. Short hops are cheap; flights cost more. Cities you just played need a couple of days to rest.</p>
      <MiniMap here={here.id} home={c.hometown} open={isOpen} onPick={(id) => setSel(id)} />
      {sorted.map(({ reg, cities }) => {
        const open = regionOpen(reg.id, owned);
        return (
          <div key={reg.id} className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-pixel text-[8px] text-muted-fg">{reg.emoji} {reg.name.toUpperCase()}</span>
              {!open && <Link to="/store?tab=drops" onClick={onClose} className="text-[10px] underline" style={{ color: "var(--gold)" }}>Tour pack</Link>}
            </div>
            {!open ? <p className="text-[11px] text-muted-fg">{reg.blurb}</p> : (
              <ul className="space-y-1.5">
                {cities.filter((x) => x.id !== here.id).map((city) => {
                  const cost = travelCost(here, city, lvl);
                  const d = cityDraw(c, city.id);
                  const lab = drawLabel(d.factor);
                  const tired = recentPlays(c, city.id) > 0;
                  const active = sel === city.id;
                  return (
                    <li key={city.id}>
                      <button className={`w-full text-left panel px-3 py-2 ${active ? "border-pink" : ""}`} onClick={() => setSel(active ? null : city.id)}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-bold">{city.id === c.hometown ? "🏠 " : ""}{city.name}</span>
                          <span className="text-[11px]" style={{ color: lab.color }}>{lab.text}</span>
                        </div>
                        <div className="text-[11px] text-muted-fg mt-0.5">{cost.mode} · {fmtNum(cost.km)} km · {fmtMoney(cost.cash)} · ⚡{cost.energy}{(c.cityFans?.[city.id] ?? 0) > 0 ? ` · ♪ ${fmtNum(c.cityFans![city.id])} local fans` : ""}{tired ? " · 😴 resting" : ""}</div>
                        {active && (
                          <div className="mt-2">
                            <p className="text-[11px]">{city.vibe}{(city.taste[c.genre] ?? 1) > 1 ? ` Loves ${GENRES[c.genre].name}.` : (city.taste[c.genre] ?? 1) < 1 ? ` Not big on ${GENRES[c.genre].name}.` : ""}</p>
                            <span className="btn btn-primary w-full mt-2 text-xs" role="button" onClick={(e) => { e.stopPropagation(); go(city.id); }}>Go to {city.name}</span>
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </Modal>
  );
}

export function HometownPicker({ onClose }: { onClose: () => void }) {
  const setHometown = useGame((s) => s.setHometown);
  const postal = usePostal((s) => s.postal);
  const pl = postal ? parsePostal(postal) : null;
  const suggest = pl ? nearestCity(pl, true) : null;
  const c = useGame((s) => s.career)!;
  return (
    <Modal open onClose={onClose}>
      <div className="font-pixel text-[10px] mb-1" style={{ color: "var(--gold)" }}>🏠 PICK YOUR HOMETOWN</div>
      <p className="text-xs text-muted-fg mb-3">Your fans so far move with you. You draw a little better at home. You can only pick once.</p>
      {suggest && <p className="text-xs mb-3">📍 Closest to you: <b>{suggest.name}</b></p>}
      <div className="grid grid-cols-2 gap-2">
        {CITIES.filter((x) => x.region === "core").map((city) => (
          <button key={city.id} className={`panel px-3 py-2 text-left ${city.id === c.hometown ? "border-gold" : ""}`} onClick={() => { const r = setHometown(city.id); toast(r); if (r.ok) onClose(); }}>
            <div className="text-sm font-bold">{city.name}</div>
            <div className="text-[10px] text-muted-fg">{(city.taste[c.genre] ?? 1) > 1 ? `❤️ Loves ${GENRES[c.genre].name}` : city.vibe}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** "You're in X" bar for the Tour page. */
export function CityBar() {
  const c = useGame((s) => s.career)!;
  const [picker, setPicker] = useState<"travel" | "home" | null>(null);
  const here = cityById(c.city ?? c.hometown);
  if (!here) return null;
  const d = cityDraw(c, here.id);
  const lab = drawLabel(d.factor);
  const tired = recentPlays(c, here.id);
  const taste = here.taste[c.genre] ?? 1;
  return (
    <>
      <div className="panel px-4 py-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📍</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">{here.name}{d.home ? " · 🏠 Hometown" : ""}</div>
            <div className="text-[11px] text-muted-fg">
              Draw here: <b style={{ color: lab.color }}>{lab.text}</b> · ♪ {fmtNum(c.cityFans?.[here.id] ?? 0)} local fans
              {taste > 1 ? ` · loves ${GENRES[c.genre].name}` : taste < 1 ? ` · cool on ${GENRES[c.genre].name}` : ""}
              {tired ? ` · 😴 played ${tired}× lately` : ""}
            </div>
          </div>
          <button className="btn btn-gold !px-3 text-[10px]" onClick={() => setPicker("travel")}>🌍 Travel</button>
        </div>
        {!c.hometownPicked && <button className="text-[11px] underline mt-2" style={{ color: "var(--gold)" }} onClick={() => setPicker("home")}>Pick your hometown (one time)</button>}
        {tired >= 2 && <p className="text-[11px] mt-2" style={{ color: "var(--neon-pink)" }}>{here.name} has seen a lot of you lately. Crowds are smaller until it rests. Try a nearby city.</p>}
      </div>
      {picker === "travel" && <CityPicker onClose={() => setPicker(null)} />}
      {picker === "home" && <HometownPicker onClose={() => setPicker(null)} />}
    </>
  );
}
