import { useState } from "react";
import { useGame } from "../game/store";
import { Card, Empty, PageTitle, Tag } from "../components/ui";

const SERVICES = ["Spotify", "Apple Music", "YouTube Music", "Amazon Music", "TikTok", "Tidal", "Deezer"];
const PRICE_PER_RELEASE = 9.99;

/** Real-world distribution. Payments go through Stripe in phase 2 — disabled for now. */
export default function Distribute() {
  const c = useGame((s) => s.career)!;
  const [releaseId, setReleaseId] = useState<string>(c.releases[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>(["Spotify", "Apple Music"]);
  const PAYMENTS_ENABLED = false;

  if (!c.releases.length) return (<div><PageTitle title="DISTRIBUTION" /><Empty emoji="📡" text="Release something first, then send it to real streaming services." /></div>);

  return (
    <div>
      <PageTitle title="DISTRIBUTION" sub="Send a release to real streaming services." />
      <Card className="mb-4" glow="gold">
        <div className="flex items-start gap-2 text-sm">
          <span>⚠️</span>
          <span>Card payments are off until Stripe is connected. You can set up an order, but checkout is disabled.</span>
        </div>
      </Card>
      <Card className="mb-4">
        <label className="font-pixel text-[8px] text-muted-fg">RELEASE</label>
        <select value={releaseId} onChange={(e) => setReleaseId(e.target.value)} className="w-full mt-2 px-3 py-2 rounded bg-black/50 border border-line">
          {c.releases.map((r) => <option key={r.id} value={r.id}>{r.title} ({r.kind.toUpperCase()})</option>)}
        </select>
      </Card>
      <Card className="mb-4">
        <div className="font-pixel text-[8px] text-muted-fg mb-3">SERVICES</div>
        <div className="grid grid-cols-2 gap-2">
          {SERVICES.map((s) => {
            const on = picked.includes(s);
            return (
              <button key={s} onClick={() => setPicked(on ? picked.filter((x) => x !== s) : [...picked, s])} className={`text-sm px-3 py-2 rounded border text-left ${on ? "border-electric bg-white/5" : "border-line text-muted-fg"}`}>
                {on ? "☑" : "☐"} {s}
              </button>
            );
          })}
        </div>
      </Card>
      <Card className="mb-6">
        <div className="flex justify-between text-sm"><span>Total</span><b>${PRICE_PER_RELEASE.toFixed(2)}</b></div>
        <div className="text-[11px] text-muted-fg mt-1">Flat fee per release, any number of services.</div>
        <button className="btn btn-gold w-full mt-3" disabled={!PAYMENTS_ENABLED || !picked.length}>Pay &amp; distribute</button>
        <div className="text-center mt-2"><Tag color="var(--danger)">STRIPE NOT CONNECTED</Tag></div>
      </Card>
    </div>
  );
}
