import { useState } from "react";
import type { GenreId } from "../game/types";
import { playSong, songTitle, type PlayHandle } from "../lib/chiptune";
import { sfx } from "../lib/fx";

/**
 * Free song generator, shared by Create (theme song) and Album. Uses the built-in synth.
 * Real AI recordings are made separately (AI studio) and are free for players too.
 */
export const MUSIC_SERVICES = [
  { id: "chiptune", name: "Chiptune", label: "TourStar Synth (built-in)", cost: 0, live: true },
] as const;

export interface Generation {
  id: string;
  at: number;
  service: string;
  status: "success" | "fallback" | "failed";
  note: string;
  seed?: number;
}

export function SongGenerator({ genre, onGenerated, history, setHistory }: {
  genre: GenreId;
  onGenerated: (seed: number, title: string) => void;
  history: Generation[];
  setHistory: (g: Generation[]) => void;
}) {
  const [playing, setPlaying] = useState<PlayHandle | null>(null);
  const svc = MUSIC_SERVICES[0];

  const run = () => {
    const seed = Math.floor(Math.random() * 1e9);
    const used = svc;
    const status: Generation["status"] = "success";
    const note = "Generated";
    const title = songTitle(seed);
    setHistory([{ id: String(seed), at: Date.now(), service: used.name, status, note: `${note}: "${title}"`, seed }, ...history].slice(0, 8));
    onGenerated(seed, title);
    sfx("coin");
    playing?.stop();
    setPlaying(playSong(seed, genre, () => setPlaying(null)));
  };

  return (
    <div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-pink flex-1" onClick={run}>🎵 Generate (free)</button>
        {playing && <button type="button" className="btn btn-ghost" onClick={() => { playing.stop(); setPlaying(null); }}>■ Stop</button>}
      </div>

      {history.length > 0 && (
        <div className="mt-4">
          <div className="font-pixel text-[8px] text-muted-fg mb-2">RECENT GENERATIONS</div>
          <ul className="space-y-1">
            {history.map((g) => (
              <li key={g.id} className="text-xs flex items-start gap-2">
                <span style={{ color: g.status === "failed" ? "var(--danger)" : g.status === "fallback" ? "var(--gold)" : "var(--success)" }}>●</span>
                <span className="flex-1 text-muted-fg">{g.note} <span className="opacity-60">· {g.service} · {new Date(g.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></span>
                {g.seed !== undefined && (
                  <button type="button" className="text-pink" onClick={() => { playing?.stop(); setPlaying(playSong(g.seed!, genre, () => setPlaying(null))); }}>▶</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
