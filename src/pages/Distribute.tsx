// TourStar Monthly: the real streaming release of songs recorded in TourStar's AI studio.
// TourStar, LLC releases a curated compilation each month; players see where to listen and whether their song made it.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, PageTitle, Tag } from "../components/ui";
import { LINK_KEYS, monthLabel, refreshMonthly, useMonthly, type MonthlyRelease } from "../lib/monthly";
import { openTickets } from "../lib/presales";

export default function Distribute() {
  const { list, loaded } = useMonthly();
  useEffect(() => { void refreshMonthly(); }, []);
  const mineCount = list.reduce((n, r) => n + r.tracks.filter((t) => t.mine).length, 0);

  return (
    <div>
      <PageTitle title="TOURSTAR MONTHLY" sub="Every month TourStar releases the best AI-studio songs on real streaming services." />
      {mineCount > 0 && (
        <Card glow="gold" className="mb-4"><p className="text-sm">🎉 You're on {mineCount === 1 ? "a TourStar Monthly release" : `${mineCount} TourStar Monthly tracks`}! Share the link with your friends.</p></Card>
      )}
      {!loaded ? <p className="text-sm text-muted-fg text-center py-6">Loading…</p>
        : list.length === 0 ? (
          <Card><p className="text-sm text-muted-fg text-center py-4">The first TourStar Monthly is on the way. Record real AI songs on your releases for a chance to be on it.</p></Card>
        ) : <div className="space-y-4">{list.map((r) => <ReleaseCard key={r.id} r={r} />)}</div>}
      <Link to="/radio" className="btn btn-pink w-full mt-5 block text-center">📻 Listen to TourStar Radio</Link>
      <Link to="/album" className="btn btn-ghost w-full mt-2 block text-center">🎧 Record a new song</Link>
      <p className="text-[11px] text-muted-fg text-center mt-4 leading-relaxed">
        Songs made in TourStar belong to TourStar, LLC. TourStar picks which songs are released and may credit your artist name. Players aren't paid for songs or names used.{" "}
        <a className="underline" href="https://tourstarapp.com/terms#content" target="_blank" rel="noreferrer">Terms</a>
      </p>
    </div>
  );
}

function ReleaseCard({ r }: { r: MonthlyRelease }) {
  const [open, setOpen] = useState(r.tracks.some((t) => t.mine));
  const links = LINK_KEYS.filter((l) => r.links[l.key]);
  return (
    <Card glow="pink">
      <div className="flex gap-3 items-start">
        {r.cover_url ? <img src={r.cover_url} alt="" className="w-20 h-20 rounded object-cover" /> : <div className="w-20 h-20 rounded flex items-center justify-center text-3xl bg-black/40">💿</div>}
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[8px]" style={{ color: "var(--gold)" }}>{monthLabel(r.month).toUpperCase()}</div>
          <div className="font-bold mt-1">{r.title}</div>
          <div className="text-xs text-muted-fg">{r.tracks.length} tracks{r.released_on ? ` · out ${new Date(r.released_on + "T12:00:00").toLocaleDateString()}` : ""}</div>
        </div>
      </div>
      {links.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {links.map((l) => <button key={l.key} className={`btn ${l.key === "hyperfollow" ? "btn-gold col-span-2" : "btn-ghost"} text-xs`} onClick={() => void openTickets(r.links[l.key]!)}>▶ {l.label}</button>)}
        </div>
      )}
      <button className="text-xs underline text-muted-fg mt-3" onClick={() => setOpen(!open)}>{open ? "Hide tracklist" : "Show tracklist"}</button>
      {open && (
        <ol className="mt-2 space-y-1 text-xs">
          {r.tracks.map((t) => (
            <li key={t.n} className={`flex gap-2 ${t.mine ? "font-bold" : ""}`} style={t.mine ? { color: "var(--gold)" } : undefined}>
              <span className="w-5 text-right text-muted-fg">{t.n}.</span>
              <span className="flex-1 min-w-0 truncate">{t.title} <span className="text-muted-fg font-normal">· {t.artist}</span></span>
              {t.mine && <Tag color="var(--gold)">YOU</Tag>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
