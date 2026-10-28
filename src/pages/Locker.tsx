import { stopRadio } from "../lib/radio";
import { useEffect, useRef, useState } from "react";
import { GENRES } from "../game/data";
import { useGame } from "../game/store";
import { playSong, makePattern } from "../lib/chiptune";
import { playClip } from "../lib/ai";
import { haptic } from "../lib/haptics";
import { Card, Empty, PageTitle, askConfirm } from "../components/ui";

export default function Locker() {
  const c = useGame((s) => s.career)!;
  const { setQueue, removeSong } = useGame();
  const songs = c.queue.map((id) => c.songs.find((s) => s.id === id)).filter(Boolean) as typeof c.songs;

  const [current, setCurrent] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);
  const [allMode, setAllMode] = useState(false);
  const handle = useRef<{ stop: () => void } | null>(null);
  const state = useRef({ loop, allMode, queue: c.queue });
  state.current = { loop, allMode, queue: c.queue };

  const stop = () => {
    handle.current?.stop();
    handle.current = null;
    setCurrent(null);
  };

  const play = (id: string) => {
    handle.current?.stop();
    const s = c.songs.find((x) => x.id === id);
    if (!s) return;
    setCurrent(id);
    const next = () => {
      const { loop, allMode, queue } = state.current;
      const i = queue.indexOf(id);
      if (allMode && i >= 0 && i < queue.length - 1) play(queue[i + 1]);
      else if (loop) play(allMode ? queue[0] : id);
      else { handle.current = null; setCurrent(null); }
    };
    // Real AI recording when there is one; otherwise the in-game synth version.
    stopRadio();
    handle.current = s.audioUrl ? playClip(s.audioUrl, { onEnd: next }) : playSong(s.seed, s.genre, next);
  };

  useEffect(() => () => handle.current?.stop(), []);

  /* ----- drag to reorder (mouse: immediate, touch: long-press) ----- */
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const press = useRef<number | null>(null);
  const shown = order ?? c.queue;

  const startDrag = (id: string) => {
    setDragId(id);
    setOrder([...c.queue]);
    haptic("pickup");
  };

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === "mouse") {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      startDrag(id);
    } else {
      const el = e.currentTarget as HTMLElement;
      const pid = e.pointerId;
      press.current = window.setTimeout(() => { el.setPointerCapture(pid); startDrag(id); }, 400);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragId) {
      if (press.current) { clearTimeout(press.current); press.current = null; }
      return;
    }
    e.preventDefault();
    const items = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    const idx = items.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (idx < 0 || !order) return;
    const from = order.indexOf(dragId);
    if (from === idx) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(idx, 0, dragId);
    setOrder(next);
    haptic("drag");
  };

  const onPointerUp = () => {
    if (press.current) { clearTimeout(press.current); press.current = null; }
    if (dragId && order) setQueue(order);
    setDragId(null);
    setOrder(null);
  };

  if (!songs.length) {
    return (
      <div>
        <PageTitle title="LOCKER" />
        <Empty emoji="🎧" text="No songs yet. Generate one when you release a Single, EP, LP or Mixtape." />
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="LOCKER" sub="Every song you've generated. Drag ≡ to reorder (long-press on phones)." />
      <Card className="mb-4 flex gap-2">
        {allMode && current ? (
          <button className="btn btn-pink flex-1" onClick={() => { setAllMode(false); stop(); }}>❚❚ Pause all</button>
        ) : (
          <button className="btn btn-pink flex-1" onClick={() => { setAllMode(true); play(c.queue[0]); }}>▶ Play all</button>
        )}
        <button className={`btn ${loop ? "btn-primary" : "btn-ghost"}`} onClick={() => setLoop((l) => !l)}>🔁 Loop{loop ? " on" : ""}</button>
      </Card>
      <ul ref={listRef} className="space-y-2 select-none" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {shown.map((id, i) => {
          const s = c.songs.find((x) => x.id === id);
          if (!s) return null;
          const playing = current === id;
          const dur = Math.round(makePattern(s.seed, s.genre).durationSec);
          return (
            <li key={id} className={`panel flex items-center gap-3 p-3 transition ${dragId === id ? "scale-[1.02] border-pink shadow-[var(--glow-pink)]" : ""} ${playing ? "border-electric" : ""}`}>
              <span className="font-pixel text-[9px] text-muted-fg w-5">{i + 1}</span>
              <button className="w-9 h-9 rounded-full border border-pink flex items-center justify-center shrink-0" onClick={() => (playing ? stop() : (setAllMode(false), play(id)))} aria-label={playing ? "Pause" : "Play"}>
                {playing ? "❚❚" : "▶"}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{s.title}</div>
                <div className="text-[11px] text-muted-fg">
                  {GENRES[s.genre].emoji} {s.source === "theme" ? "Theme song" : s.source === "live" ? "Debuted live" : "Release"}
                  {s.audioUrl ? <span className="ml-1" style={{ color: "var(--gold)" }}>· 🎧 AI studio</span>
                    : s.ai === "pending" ? <span className="ml-1 animate-pulse" style={{ color: "var(--electric)" }}>· Recording…</span>
                    : <> · 0:{String(dur).padStart(2, "0")}</>}
                </div>
              </div>
              <button className="text-muted-fg text-xs px-1" aria-label="Delete" onClick={() => askConfirm(`Delete "${s.title}" from your Locker?`, () => { if (current === id) stop(); removeSong(id); }, { yes: "Delete", danger: true })}>✕</button>
              <span className="text-xl text-muted-fg cursor-grab touch-none px-1" onPointerDown={(e) => onPointerDown(e, id)} aria-label="Drag to reorder">≡</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
