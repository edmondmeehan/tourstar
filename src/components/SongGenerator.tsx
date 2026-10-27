import { useState } from "react";
import type { GenreId } from "../game/types";
import { playSong, songTitle, type PlayHandle } from "../lib/chiptune";
import { Modal, Tag } from "./ui";
import { sfx } from "../lib/fx";

/**
 * Music service picker + typed confirmation, shared by Create (theme song) and Album.
 * Phase 1 only the built-in chiptune synth is live. ElevenLabs / Replicate slots are
 * wired into the same flow so connecting them later is a backend-only change.
 */
export const MUSIC_SERVICES = [
  { id: "chiptune", name: "Chiptune", label: "TourStar Synth (built-in)", cost: 0, live: true },
  { id: "elevenlabs", name: "ElevenLabs", label: "ElevenLabs Music", cost: 0.8, live: false },
  { id: "replicate", name: "Replicate", label: "Replicate (backup)", cost: 0.12, live: false },
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
  const [service, setService] = useState<(typeof MUSIC_SERVICES)[number]["id"]>("chiptune");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [playing, setPlaying] = useState<PlayHandle | null>(null);
  const svc = MUSIC_SERVICES.find((s) => s.id === service)!;

  const run = () => {
    setConfirming(false);
    setTyped("");
    const seed = Math.floor(Math.random() * 1e9);
    let used = svc;
    let status: Generation["status"] = "success";
    let note = "Generated";
    if (!svc.live) {
      // Mirrors the original behaviour: if the paid service refuses, switch to the backup.
      used = MUSIC_SERVICES[0];
      status = "fallback";
      note = `${svc.name} not connected — switched to ${used.name}`;
    }
    const title = songTitle(seed);
    setHistory([{ id: String(seed), at: Date.now(), service: used.name, status, note: `${note}: "${title}"`, seed }, ...history].slice(0, 8));
    onGenerated(seed, title);
    sfx("coin");
    playing?.stop();
    setPlaying(playSong(seed, genre, () => setPlaying(null)));
  };

  return (
    <div>
      <div className="grid gap-2 mb-3">
        {MUSIC_SERVICES.map((s) => (
          <button key={s.id} type="button" onClick={() => setService(s.id)} className={`flex items-center justify-between px-3 py-2 rounded border text-left text-sm ${service === s.id ? "border-pink bg-white/5" : "border-line"}`}>
            <span>{s.label}</span>
            <span className="flex items-center gap-2">
              {!s.live && <Tag>Phase 2</Tag>}
              <span className="font-pixel text-[9px]" style={{ color: "var(--gold)" }}>{s.cost ? `$${s.cost.toFixed(2)}` : "FREE"}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-pink flex-1" onClick={() => setConfirming(true)}>🎵 Generate</button>
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

      <Modal open={confirming} onClose={() => setConfirming(false)}>
        <h3 className="font-pixel text-xs mb-3" style={{ color: "var(--gold)" }}>CONFIRM GENERATION</h3>
        <p className="text-sm mb-1">Service: <b>{svc.label}</b></p>
        <p className="text-sm mb-4">Cost: <b>{svc.cost ? `$${svc.cost.toFixed(2)} per song` : "Free"}</b></p>
        {!svc.live && <p className="text-xs text-gold mb-3">Not connected yet — this will fall back to the built-in synth.</p>}
        <label className="text-xs text-muted-fg">Type <b className="text-fg">{svc.name}</b> to confirm</label>
        <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full mt-2 mb-4 px-3 py-2 rounded bg-black/50 border border-line outline-none focus:border-pink" />
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={() => setConfirming(false)}>Cancel</button>
          <button type="button" className="btn btn-pink flex-1" disabled={typed.trim().toLowerCase() !== svc.name.toLowerCase()} onClick={run}>Confirm</button>
        </div>
      </Modal>
    </div>
  );
}
