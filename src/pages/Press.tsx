// The Press: AI-written news about your artist, critic reviews of your releases, your weekly recap, and
// a chat with your manager. Written by Claude from your career stats; all fiction inside the game.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, PageTitle, toast } from "../components/ui";
import { useCloud, cloudConfigured } from "../lib/cloud";
import { requestPress, usePress, weekKey, type PressItem } from "../lib/press";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const scoreColor = (n: number) => (n >= 8 ? "var(--gold)" : n >= 6.5 ? "var(--neon-pink)" : n >= 5 ? "var(--electric)" : "var(--danger)");

export default function Press() {
  const [tab, setTab] = useState<"news" | "manager">("news");
  const signedIn = useCloud((s) => !!s.session);
  const { enabled, loaded } = usePress();

  return (
    <div>
      <PageTitle title="THE PRESS" sub="What the music world is saying about you. Stories, reviews and your weekly recap, written about your career." />
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(["news", "manager"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? "btn-pink" : "btn-ghost"} !py-2 text-xs`}>{t === "news" ? "📰 News & reviews" : "🧢 Ask your manager"}</button>
        ))}
      </div>
      {!cloudConfigured || !signedIn ? (
        <Card className="text-center">
          <div className="text-3xl mb-2">📰</div>
          <p className="text-sm">Sign in and the press starts covering your career: stories after big shows, reviews of every release and a weekly recap.</p>
          <Link to="/login" className="btn btn-pink mt-3 inline-block">Sign in</Link>
        </Card>
      ) : !loaded ? <p className="text-sm text-muted-fg text-center py-8">Loading…</p>
        : !enabled ? <Card className="text-center"><p className="text-sm text-muted-fg">The press isn't covering TourStar yet. Check back soon.</p></Card>
        : tab === "news" ? <News /> : <Manager />}
      <p className="text-[10px] text-muted-fg text-center mt-6">Written by AI about your in-game career. Every outlet, quote and rival is fiction.</p>
    </div>
  );
}

function News() {
  const { items, capped, writing } = usePress();
  const news = items.filter((x) => x.kind !== "chat");
  const recap = news.find((x) => x.kind === "recap" && x.event === `recap:${weekKey()}`);
  const rest = news.filter((x) => x !== recap);
  return (
    <>
      {writing > 0 && <p className="text-xs text-center mb-3 animate-pulse" style={{ color: "var(--gold)" }}>✍️ A reporter is writing about you…</p>}
      {capped && <p className="text-[11px] text-muted-fg text-center mb-3">That's all the coverage for today. The press is back tomorrow.</p>}
      {recap && <Recap it={recap} />}
      {!rest.length && !recap ? (
        <Card className="text-center"><div className="text-3xl mb-2">🎤</div><p className="text-sm text-muted-fg">No coverage yet. Sell out a show, drop a release or level up and the press will notice.</p></Card>
      ) : (
        <div className="space-y-3">{rest.map((it) => (it.kind === "review" ? <Review key={it.id} it={it} /> : <Story key={it.id} it={it} />))}</div>
      )}
    </>
  );
}

function Byline({ it, label }: { it: PressItem; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <span className="font-pixel text-[8px] truncate" style={{ color: "var(--neon-pink)" }}>{(label ?? it.outlet ?? "").toUpperCase()}</span>
      <span className="text-[10px] text-muted-fg shrink-0">{ago(it.created_at)}</span>
    </div>
  );
}

function Story({ it }: { it: PressItem }) {
  return (
    <Card>
      <Byline it={it} />
      <h3 className="font-bold leading-snug">{it.headline}</h3>
      <p className="text-sm text-muted-fg mt-1.5 leading-relaxed">{it.body}</p>
    </Card>
  );
}

function Review({ it }: { it: PressItem }) {
  const score = it.meta.score ?? 5;
  return (
    <Card glow={score >= 8 ? "gold" : undefined}>
      <Byline it={it} label={`${it.outlet || "Review"} · review`} />
      <div className="flex gap-3">
        <div className="shrink-0 w-14 h-14 rounded-lg border-2 flex items-center justify-center font-pixel text-sm tabular-nums" style={{ borderColor: scoreColor(score), color: scoreColor(score) }}>{score.toFixed(1)}</div>
        <div className="min-w-0">
          <h3 className="font-bold leading-snug">{it.headline}</h3>
          <p className="text-[11px] text-muted-fg mt-0.5 truncate">{it.event.startsWith("release:") ? "" : it.event}</p>
        </div>
      </div>
      <p className="text-sm text-muted-fg mt-2 leading-relaxed">{it.body}</p>
      {!!it.meta.tips?.length && (
        <div className="mt-3 rounded bg-black/30 p-3">
          <div className="font-pixel text-[8px] mb-1.5" style={{ color: "var(--gold)" }}>FOR NEXT TIME</div>
          <ul className="text-xs space-y-1">{it.meta.tips.map((t, i) => <li key={i}>→ {t}</li>)}</ul>
        </div>
      )}
    </Card>
  );
}

function Recap({ it }: { it: PressItem }) {
  return (
    <Card glow="gold" className="mb-4">
      <Byline it={it} label="Your week in music" />
      <h3 className="font-bold leading-snug">{it.headline}</h3>
      <p className="text-sm text-muted-fg mt-1.5 leading-relaxed">{it.body}</p>
      {!!it.meta.highlights?.length && <ul className="text-xs mt-3 space-y-1">{it.meta.highlights.map((h, i) => <li key={i}>⭐ {h}</li>)}</ul>}
      {it.meta.suggestion && <p className="text-xs mt-3 rounded bg-black/30 p-2.5"><b style={{ color: "var(--gold)" }}>This week:</b> {it.meta.suggestion}</p>}
    </Card>
  );
}

const QUICK = ["What should I do next?", "How do I get more fans?", "Should I sign with a label?", "Why are my releases scoring low?", "Am I ready for a bigger tour?"];

function Manager() {
  const items = usePress((s) => s.items);
  const chat = useMemo(() => items.filter((x) => x.kind === "chat").slice(0, 20).reverse(), [items]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chat.length, pending]);

  const ask = async (q: string) => {
    const message = q.trim();
    if (!message || busy) return;
    setBusy(true); setPending(message); setText("");
    const r = await requestPress("chat", "manager", { message, history: chat.slice(-6).map((x) => ({ q: x.meta.q, a: x.body })) });
    setBusy(false); setPending(null);
    if (r.limit) toast({ ok: false, message: "Your manager's phone is off for today. Ask again tomorrow." });
    else if (r.error) { toast({ ok: false, message: r.error }); setText(message); }
  };

  return (
    <>
      <Card className="mb-3">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🧢</div>
          <p className="text-xs text-muted-fg">Your manager knows your numbers. Ask anything about your career and get straight advice.</p>
        </div>
      </Card>
      <div className="space-y-2.5 mb-3">
        {chat.map((m) => (
          <div key={m.id} className="space-y-1.5">
            <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm" style={{ background: "color-mix(in oklab, var(--neon-pink) 22%, transparent)" }}>{m.meta.q}</div></div>
            <div className="flex"><div className="max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm bg-black/40 border border-line">{m.body}</div></div>
          </div>
        ))}
        {pending && (
          <div className="space-y-1.5">
            <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm" style={{ background: "color-mix(in oklab, var(--neon-pink) 22%, transparent)" }}>{pending}</div></div>
            <div className="flex"><div className="rounded-2xl rounded-bl-sm px-3 py-2 text-sm bg-black/40 border border-line animate-pulse">…</div></div>
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {QUICK.map((q) => <button key={q} disabled={busy} onClick={() => void ask(q)} className="shrink-0 px-3 py-1.5 rounded-full border border-line text-[11px] text-muted-fg">{q}</button>)}
      </div>
      <form className="flex gap-2 mt-1" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Ask your manager…" className="flex-1 min-w-0 px-3 py-2 rounded bg-black/50 border border-line outline-none focus:border-pink text-sm" />
        <button className="btn btn-pink text-xs shrink-0" disabled={busy || !text.trim()}>{busy ? "…" : "Ask"}</button>
      </form>
    </>
  );
}
