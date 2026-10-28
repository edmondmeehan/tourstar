// Mini radio player above the bottom nav: shows what's on TourStar Radio while you move around the game.
import { useLocation, useNavigate } from "react-router-dom";
import { closeRadio, playAt, stopRadio, useRadio } from "../lib/radio";

export default function RadioBar() {
  const { station, queue, idx, playing } = useRadio();
  const loc = useLocation();
  const nav = useNavigate();
  const song = queue?.[idx];
  if (!station || !song || loc.pathname === "/radio") return null;
  return (
    <div className="fixed inset-x-0 z-40 px-3" style={{ bottom: "calc(env(safe-area-inset-bottom) + 64px)" }}>
      <div className="max-w-md mx-auto panel flex items-center gap-2 px-3 py-2 shadow-lg" style={{ borderColor: "var(--neon-pink)" }}>
        <button className="flex-1 min-w-0 text-left" onClick={() => nav("/radio")} aria-label="Open TourStar Radio">
          <div className="font-pixel text-[7px]" style={{ color: "var(--gold)" }}>📻 TOURSTAR RADIO{playing ? "" : " · PAUSED"}</div>
          <div className="text-xs truncate mt-0.5">{song.title} <span className="text-muted-fg">· {song.artist}</span></div>
        </button>
        <button className="w-9 h-9 rounded-full border border-line text-sm" aria-label={playing ? "Pause" : "Play"} onClick={() => (playing ? stopRadio() : playAt(idx))}>{playing ? "❚❚" : "▶"}</button>
        <button className="w-9 h-9 rounded-full border border-line text-sm" aria-label="Next song" onClick={() => playAt(idx + 1)}>▶▶</button>
        <button className="w-9 h-9 rounded-full border border-line text-sm text-muted-fg" aria-label="Turn off radio" onClick={closeRadio}>✕</button>
      </div>
    </div>
  );
}
