import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, PageTitle, Tag, toast } from "../components/ui";
import { openTickets, presaleAudience, refreshPresales, revealCode, usePresales, type Presale } from "../lib/presales";
import { useCloud } from "../lib/cloud";
import { sfx } from "../lib/fx";

const fmt = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function when(p: Presale, now: number) {
  const start = Date.parse(p.starts_at), end = Date.parse(p.ends_at);
  if (now < start) {
    const h = Math.floor((start - now) / 36e5), d = Math.floor(h / 24);
    return { live: false, text: `Presale starts ${fmt(p.starts_at)}${d ? ` · in ${d}d ${h % 24}h` : h ? ` · in ${h}h` : " · soon"}` };
  }
  return { live: now < end, text: `Presale is LIVE until ${fmt(p.ends_at)}` };
}

export function PresaleCard({ p, now }: { p: Presale; now: number }) {
  const [busy, setBusy] = useState(false);
  const signedIn = useCloud((s) => !!s.session);
  const w = when(p, now);
  const reveal = async () => {
    setBusy(true);
    const r = await revealCode(p.id);
    setBusy(false);
    if (r.ok) sfx("levelup"); else toast(r);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(p.code!); toast({ ok: true, message: "Code copied." }); } catch { /* ignore */ } };
  return (
    <Card glow={p.eligible ? "gold" : undefined}>
      <div className="flex items-start gap-3">
        <div className="text-4xl leading-none">{p.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[8px]" style={{ color: w.live ? "var(--success)" : "var(--gold)" }}>{w.live ? "● PRESALE LIVE" : "VIP PRESALE"}</div>
          <div className="font-bold mt-1">{p.artist}</div>
          <div className="text-sm">{p.title}</div>
          <p className="text-xs text-muted-fg mt-1">{w.text}</p>
          {p.description && <p className="text-xs text-muted-fg mt-1">{p.description}</p>}
        </div>
      </div>
      <div className="mt-3">
        {p.code ? (
          <>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-center font-pixel text-sm py-2.5 rounded border border-gold" style={{ color: "var(--gold)" }}>{p.code}</code>
              <button className="btn btn-ghost !px-3 text-xs" onClick={copy}>Copy</button>
            </div>
            <button className="btn btn-pink w-full mt-2" onClick={() => void openTickets(p.ticket_url)}>Open Ticketmaster</button>
            <p className="text-[11px] text-muted-fg mt-2">This code is just for you. Sharing or reselling it can get it cancelled by the ticket seller.</p>
          </>
        ) : p.eligible ? (
          p.sold_out ? <Tag color="var(--muted-foreground)">ALL CODES CLAIMED</Tag>
            : <button className="btn btn-gold w-full" disabled={busy} onClick={() => void reveal()}>{busy ? "…" : "🎟️ Reveal my code"}</button>
        ) : (
          <div className="text-xs text-muted-fg">
            For {presaleAudience(p)}.{" "}
            {!signedIn ? <Link to="/login" className="underline">Sign in</Link> : p.for_vip ? <Link to="/premium" className="underline" style={{ color: "var(--gold)" }}>Become a VIP</Link> : null}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Presales() {
  const { list, loaded } = usePresales();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { void refreshPresales(); const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  return (
    <div>
      <PageTitle title="VIP PRESALES" sub="Real Ticketmaster presale codes for upcoming tours, before tickets go on sale to everyone." />
      {!loaded ? <p className="text-sm text-muted-fg text-center py-6">Loading…</p>
        : list.length === 0 ? <Card><p className="text-sm text-muted-fg text-center py-4">No presales right now. Turn on notifications in Account and we'll tell you when the next one drops.</p></Card>
        : <div className="space-y-3">{list.map((p) => <PresaleCard key={p.id} p={p} now={now} />)}</div>}
      <p className="text-[11px] text-muted-fg text-center mt-5 leading-relaxed">Presale codes give access to buy tickets during the presale; they don't guarantee tickets. Tickets are sold by Ticketmaster under its terms and the artist's ticket limits. Codes are offered with the artist's permission and are never sold.</p>
    </div>
  );
}

/** Small card for Home: the next presale, if any. */
export function PresalesTeaser() {
  const list = usePresales((s) => s.list);
  useEffect(() => { void refreshPresales(); }, []);
  if (!list.length) return null;
  const p = list[0];
  return (
    <Link to="/presales" className="block mb-4">
      <Card glow="gold" className="flex items-center gap-3">
        <div className="text-3xl">🎟️</div>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[8px]" style={{ color: "var(--gold)" }}>VIP PRESALE{list.length > 1 ? `S · ${list.length}` : ""}</div>
          <div className="text-sm font-bold truncate mt-1">{p.artist} · {p.title}</div>
          <div className="text-[11px] text-muted-fg">{p.code ? "Your code is ready" : p.eligible ? "Tap to reveal your code" : `For ${presaleAudience(p)}`}</div>
        </div>
        <span className="text-muted-fg">›</span>
      </Card>
    </Link>
  );
}
