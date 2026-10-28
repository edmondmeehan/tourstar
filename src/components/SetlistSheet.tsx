import { useMemo, useState } from "react";
import type { TourDef } from "../game/data";
import { useGame } from "../game/store";
import { DIFFICULTIES, showTuning, type Difficulty } from "../game/difficulty";
import { SET_SLOTS, autoSetlist, fanRequest, setlistScore, songPool, type SetSong } from "../game/setlist";
import { Modal, toast } from "./ui";
import { useConcert } from "../concert/useConcert";
import { sfx } from "../lib/fx";
import { showVenue, trackVenue, type Venue } from "../lib/venues";

const TAG_COLOR: Record<string, string> = { "FAN FAVE": "var(--gold)", NEW: "var(--electric)", COVER: "var(--muted-foreground)" };

function Appeal({ v }: { v: number }) {
  const stars = Math.max(1, Math.round(v / 20));
  return <span className="text-[10px] tracking-tight" style={{ color: "var(--gold)" }} aria-label={`Appeal ${v} of 100`}>{"★".repeat(stars)}<span className="opacity-25">{"★".repeat(5 - stars)}</span></span>;
}

export default function SetlistSheet({ tour, venue, onClose }: { tour: TourDef; venue?: Venue; onClose: () => void }) {
  const c = useGame((s) => s.career)!;
  const startShow = useGame((s) => s.startShow);
  const startConcert = useConcert((s) => s.start);
  const slots = SET_SLOTS[tour.id] ?? 3;
  const pool = useMemo(() => songPool(c), [c]);
  const requestKey = useMemo(() => fanRequest(c, pool), [c, pool]);
  const [keys, setKeys] = useState<string[]>(() => {
    const last = (c.lastSetlist ?? []).filter((k) => pool.some((p) => p.key === k)).slice(0, slots);
    return last.length ? last : autoSetlist(pool, slots, requestKey);
  });
  const [diff, setDiff] = useState<Difficulty>(c.tutorial ? "normal" : c.lastDifficulty ?? "normal");
  const tuning = showTuning(tour.level, diff);
  const byKey = (k: string) => pool.find((p) => p.key === k)!;
  const score = setlistScore(keys, pool, requestKey, slots);
  const request = requestKey ? byKey(requestKey) : null;

  const add = (s: SetSong) => { if (keys.length < slots) { setKeys([...keys, s.key]); sfx("click"); } };
  const remove = (k: string) => setKeys(keys.filter((x) => x !== k));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    const next = [...keys];
    [next[i], next[j]] = [next[j], next[i]];
    setKeys(next);
  };

  const go = () => {
    const r = startShow(tour.id, keys, diff, venue ? showVenue(venue) : undefined);
    if (!r.ok || !r.show) { toast(r); return; }
    if (venue) trackVenue(venue.id, "play");
    onClose();
    startConcert(r.show);
  };

  const available = pool.filter((p) => !keys.includes(p.key));
  const ownSongs = pool.filter((p) => !p.cover).length;

  return (
    <Modal open onClose={onClose}>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-pixel text-xs" style={{ color: "var(--gold)" }}>SETLIST</h3>
        <span className="text-xs text-muted-fg">{venue ? `${venue.emoji} ${venue.name}` : `${tour.emoji} ${tour.name}`} · {slots} songs</span>
      </div>
      <p className="text-[11px] text-muted-fg mb-3">Your opener and closer matter most. Songs you play often become fan faves.</p>

      {request && (
        <div className="text-xs rounded px-3 py-2 mb-3 bg-black/40 border" style={{ borderColor: "var(--gold)" }}>
          🙋 Fans are shouting for <b>{request.title}</b>{keys.includes(request.key) ? " — it's in. ✓" : ". Play it for a bonus."}
        </div>
      )}

      <ol className="space-y-1.5 mb-3">
        {Array.from({ length: slots }, (_, i) => {
          const k = keys[i];
          const s = k ? byKey(k) : null;
          const role = i === 0 ? "OPENER" : i === slots - 1 ? "CLOSER" : `#${i + 1}`;
          return (
            <li key={i} className={`flex items-center gap-2 rounded px-2 py-2 ${s ? "bg-black/40" : "border border-dashed border-line"}`}>
              <span className="font-pixel text-[7px] w-12 shrink-0 text-muted-fg">{role}</span>
              {s ? (
                <>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{s.title}</span>
                    <span className="flex items-center gap-2"><Appeal v={s.appeal} />{s.tag && <span className="font-pixel text-[6px]" style={{ color: TAG_COLOR[s.tag] }}>{s.tag}</span>}</span>
                  </span>
                  <button className="w-7 h-7 rounded bg-black/40 text-xs disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button className="w-7 h-7 rounded bg-black/40 text-xs disabled:opacity-30" disabled={i >= keys.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  <button className="w-7 h-7 rounded bg-black/40 text-xs" onClick={() => remove(s.key)} aria-label="Remove">✕</button>
                </>
              ) : <span className="text-xs text-muted-fg">Pick a song below</span>}
            </li>
          );
        })}
      </ol>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1"><span>Setlist strength</span><b className="tabular-nums">{Math.round(score * 100)}%</b></div>
        <div className="h-2 rounded bg-black/40 overflow-hidden"><div className="h-full rounded" style={{ width: `${score * 100}%`, background: "linear-gradient(90deg, var(--electric), var(--neon-pink))" }} /></div>
      </div>

      <div className="flex justify-between items-center mb-2">
        <span className="font-pixel text-[8px] text-muted-fg">YOUR SONGS</span>
        <button className="text-xs underline text-electric" onClick={() => setKeys(autoSetlist(pool, slots, requestKey))}>Auto-pick best</button>
      </div>
      <ul className="max-h-48 overflow-y-auto space-y-1 mb-3 pr-1">
        {available.map((s) => (
          <li key={s.key}>
            <button className="w-full flex items-center gap-2 rounded px-2 py-1.5 bg-black/25 hover:bg-black/50 text-left disabled:opacity-40" disabled={keys.length >= slots} onClick={() => add(s)}>
              <span className="flex-1 min-w-0 text-sm truncate">{s.title}{s.key === requestKey && " 🙋"}</span>
              {s.tag && <span className="font-pixel text-[6px]" style={{ color: TAG_COLOR[s.tag] }}>{s.tag}</span>}
              <Appeal v={s.appeal} />
            </button>
          </li>
        ))}
      </ul>
      {ownSongs < slots && <p className="text-[11px] text-muted-fg mb-3">Short on originals? Release music on the Album screen, or debut a song during an encore.</p>}

      {!c.tutorial && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="font-pixel text-[8px] text-muted-fg">DIFFICULTY</span>
            <span className="text-[10px] text-muted-fg">Notes fall at {tuning.speedLabel} speed here</span>
          </div>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Difficulty">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
              <button key={d} role="radio" aria-checked={diff === d} onClick={() => { setDiff(d); sfx("click"); }}
                className={`rounded border py-2 text-xs font-bold ${diff === d ? "bg-black/40" : "border-line text-muted-fg"}`}
                style={diff === d ? { borderColor: DIFFICULTIES[d].color, color: DIFFICULTIES[d].color } : undefined}>
                {DIFFICULTIES[d].emoji} {DIFFICULTIES[d].label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-fg mt-1.5">{DIFFICULTIES[diff].blurb}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary flex-[2]" disabled={!keys.length} onClick={go}>🎤 Go on stage</button>
      </div>
    </Modal>
  );
}
