// Store → Drops: limited-time packs bought with Gold Records, plus "My style" to equip what you own.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useGame } from "../game/store";
import { levelFor } from "../game/engine";
import { MOVES, STAGE_THEMES, itemLabel, moveName, stageTheme, type DropItem } from "../game/cosmetics";
import { openMerch, revealPackCode, usePackPerks, type PackPerk } from "../lib/packperks";
import { Card, Tag, askConfirm, toast } from "../components/ui";
import { buyDrop, ownedItems, refreshGold, useGold, visibleDrops, type Drop } from "../lib/gold";
import { useCloud } from "../lib/cloud";
import { sfx } from "../lib/fx";

const KIND: Record<Drop["kind"], { label: string; color: string }> = {
  artist: { label: "OFFICIAL ARTIST", color: "var(--gold)" },
  starter: { label: "NEW PLAYER OFFER", color: "var(--success)" },
  season: { label: "SEASON", color: "var(--electric)" },
  bundle: { label: "LIMITED DROP", color: "var(--neon-pink)" },
};

function timeLeft(end: string | null, now: number) {
  if (!end) return null;
  const ms = Date.parse(end) - now;
  if (ms <= 0) return "ended";
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return d ? `${d}d ${h}h left` : h ? `${h}h ${m}m left` : `${m}m left`;
}

export function DropsTab() {
  const { gold, loaded } = useGold();
  useGold((s) => s.drops); useGold((s) => s.owned); // re-render on changes
  const signedIn = useCloud((s) => !!s.session);
  const c = useGame((s) => s.career)!;
  const lvl = Math.max(c.peakLevel ?? 1, levelFor(c.stats.fame).level);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { void refreshGold(); const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);

  const drops = visibleDrops().filter((d) => !d.ends_at || Date.parse(d.ends_at) > now);

  const buy = (d: Drop) => {
    if (!signedIn) return toast({ ok: false, message: "Sign in (Account tab) to buy drops. Your items are saved to your account." });
    if (gold < d.price_gold) return toast({ ok: false, message: `You need ${(d.price_gold - gold).toLocaleString()} more Gold Records.` });
    askConfirm(`Buy ${d.name} for ${d.price_gold.toLocaleString()} Gold Records?`, async () => {
      setBusy(d.id);
      const r = await buyDrop(d);
      setBusy(null);
      toast(r);
      if (r.ok) sfx("levelup");
    }, { yes: `Buy · 💿 ${d.price_gold.toLocaleString()}` });
  };

  return (
    <div>
      <Card glow="gold" className="mb-4 flex items-center gap-3">
        <div className="text-3xl">💿</div>
        <div className="flex-1">
          <div className="font-pixel text-[11px]" style={{ color: "var(--gold)" }}>{signedIn ? `${gold.toLocaleString()} GOLD RECORDS` : "GOLD RECORDS"}</div>
          <div className="text-[11px] text-muted-fg mt-1">{signedIn ? "Spend Gold on drops. VIP members get 150 every month." : "Sign in to collect and spend Gold."}</div>
        </div>
        <Link to="/premium" className="btn btn-gold !px-3 text-xs">Get Gold</Link>
      </Card>

      {!loaded ? <p className="text-sm text-muted-fg text-center py-6">Loading drops…</p>
        : drops.length === 0 ? <Card><p className="text-sm text-muted-fg text-center py-4">No drops right now. New packs land often, so check back soon.</p></Card>
        : (
          <div className="space-y-3">
            {drops.map((d) => {
              const k = KIND[d.kind];
              const locked = lvl < d.min_level;
              const left = timeLeft(d.ends_at, now);
              return (
                <Card key={d.id} className={locked ? "opacity-60" : ""} glow={d.kind === "artist" ? "gold" : undefined}>
                  {d.image_url && <img src={d.image_url} alt="" className="w-full h-36 object-cover rounded mb-3" loading="lazy" />}
                  <div className="flex items-start gap-3">
                    <div className="text-4xl leading-none">{d.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-pixel text-[8px]" style={{ color: k.color }}>{k.label}{left && <span className="text-muted-fg"> · {left}</span>}</div>
                      <div className="font-bold mt-1">{d.name}</div>
                      {d.description && <p className="text-xs text-muted-fg mt-1">{d.description}</p>}
                      <ul className="text-xs mt-2 space-y-0.5">{d.items.map((it, i) => <li key={i}>{itemLabel(it)}</li>)}</ul>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3 mt-3">
                    {d.was_gold && d.was_gold > d.price_gold && <span className="text-xs text-muted-fg line-through">💿 {d.was_gold.toLocaleString()}</span>}
                    {locked ? <Tag color="var(--gold)">UNLOCKS AT LV{d.min_level}</Tag> : (
                      <button className="btn btn-pink !px-4" disabled={busy !== null} onClick={() => buy(d)}>{busy === d.id ? "…" : `💿 ${d.price_gold.toLocaleString()}`}</button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      <PackPerks />
      <MyStyle />
      <p className="text-[11px] text-muted-fg text-center mt-5">Drops are cosmetic and gameplay extras. They never include reward points or raffle entries.</p>
    </div>
  );
}

/** Equip stage themes, titles and badges you own. */
export function MyStyle() {
  const style = useGame((s) => s.career?.style) ?? {};
  const setStyle = useGame((s) => s.setStyle);
  useGold((s) => s.owned);
  const items = ownedItems();
  const stages = ["classic", ...new Set(items.filter((i): i is Extract<DropItem, { type: "stage" }> => i.type === "stage").map((i) => i.id))];
  const titles = [...new Set(items.filter((i): i is Extract<DropItem, { type: "title" }> => i.type === "title").map((i) => i.name))];
  const badges = [...new Map(items.filter((i): i is Extract<DropItem, { type: "badge" }> => i.type === "badge").map((i) => [i.emoji, i])).values()];
  const skins = [...new Map(items.filter((i): i is Extract<DropItem, { type: "skin" }> => i.type === "skin").map((i) => [`${i.a}${i.b}${i.bg}`, i])).values()];
  const moves = [...new Map(items.filter((i): i is Extract<DropItem, { type: "moves" }> => i.type === "moves").map((i) => [`${i.id}:${i.members ?? 1}`, i])).values()];

  const chip = (on: boolean) => `px-3 py-2 rounded-full border text-xs ${on ? "border-pink text-pink bg-black/30" : "border-line text-muted-fg"}`;
  return (
    <div className="mt-6">
      <h2 className="font-pixel text-[10px] mb-3" style={{ color: "var(--neon-pink)" }}>MY STYLE</h2>
      <Card>
        <div className="text-xs text-muted-fg mb-2">Stage</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {stages.map((id) => {
            const t = stageTheme(id);
            const on = (style.stage ?? "classic") === id;
            return (
              <button key={id} className={chip(on)} onClick={() => { setStyle({ stage: id === "classic" ? undefined : id }); sfx("click"); }}>
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: `#${t.a.toString(16).padStart(6, "0")}` }} />{t.emoji} {t.name}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-muted-fg mb-2">Title</div>
        <div className="flex flex-wrap gap-2 mb-4">
          <button className={chip(!style.title)} onClick={() => setStyle({ title: undefined })}>None</button>
          {titles.map((t) => <button key={t} className={chip(style.title === t)} onClick={() => setStyle({ title: t })}>{t}</button>)}
          {!titles.length && <span className="text-xs text-muted-fg self-center">Titles come in drops.</span>}
        </div>
        <div className="text-xs text-muted-fg mb-2">Badge</div>
        <div className="flex flex-wrap gap-2">
          <button className={chip(!style.badge)} onClick={() => setStyle({ badge: undefined })}>None</button>
          {badges.map((b) => <button key={b.emoji} className={chip(style.badge === b.emoji)} onClick={() => setStyle({ badge: b.emoji })}>{b.emoji} {b.name ?? ""}</button>)}
          {!badges.length && <span className="text-xs text-muted-fg self-center">Badges come with packs, merch orders and invite rewards.</span>}
        </div>
        <div className="text-xs text-muted-fg mb-2 mt-4">App colors</div>
        <div className="flex flex-wrap gap-2">
          <button className={chip(!style.skin)} onClick={() => setStyle({ skin: undefined })}>TourStar</button>
          {skins.map((k) => {
            const on = style.skin?.a === k.a && style.skin?.b === k.b && style.skin?.bg === k.bg;
            return (
              <button key={`${k.a}${k.b}${k.bg}`} className={chip(on)} onClick={() => { setStyle({ skin: { name: k.name, a: k.a, b: k.b, bg: k.bg } }); sfx("click"); }}>
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1 align-middle border border-black/40" style={{ background: k.a }} />
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: k.b }} />{k.name}
              </button>
            );
          })}
          {!skins.length && <span className="text-xs text-muted-fg self-center">App colors come in artist packs.</span>}
        </div>
        <div className="text-xs text-muted-fg mb-2 mt-4">Dance moves</div>
        <div className="flex flex-wrap gap-2">
          <button className={chip(!style.moves)} onClick={() => setStyle({ moves: undefined })}>Classic</button>
          {moves.map((m) => {
            const members = m.members ?? 1;
            const on = style.moves?.id === m.id && style.moves.members === members;
            return <button key={`${m.id}:${members}`} className={chip(on)} title={MOVES.find((x) => x.id === m.id)?.blurb} onClick={() => { setStyle({ moves: { id: m.id, members, match: !!m.match } }); sfx("click"); }}>🕺 {m.name || moveName(m.id)}{members > 1 ? ` ×${members}` : ""}</button>;
          })}
          {!moves.length && <span className="text-xs text-muted-fg self-center">Dance moves come in artist packs.</span>}
        </div>
        {STAGE_THEMES.length > stages.length && <p className="text-[11px] text-muted-fg mt-4">{STAGE_THEMES.length - stages.length} more stage themes to collect from drops.</p>}
      </Card>
    </div>
  );
}

/** Real-world perks from packs you own: merch discount codes and the artist's store. */
export function PackPerks() {
  const list = usePackPerks((s) => s.list);
  if (!list.length) return null;
  return (
    <div className="mt-6">
      <h2 className="font-pixel text-[10px] mb-3" style={{ color: "var(--gold)" }}>MY PACK PERKS</h2>
      <div className="space-y-3">{list.map((p) => <PerkCard key={p.drop_id} p={p} />)}</div>
    </div>
  );
}

function PerkCard({ p }: { p: PackPerk }) {
  const [busy, setBusy] = useState(false);
  const reveal = async () => { setBusy(true); const r = await revealPackCode(p.drop_id); setBusy(false); if (!r.ok) toast(r); else sfx("coin"); };
  const copy = async () => { try { await navigator.clipboard.writeText(p.code ?? ""); toast({ ok: true, message: "Code copied." }); } catch { toast({ ok: false, message: "Couldn't copy. Long-press the code instead." }); } };
  return (
    <Card glow="gold">
      <div className="flex items-start gap-3">
        <div className="text-3xl leading-none">{p.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">{p.pack}</div>
          {p.discount_text && <div className="text-xs mt-0.5" style={{ color: "var(--gold)" }}>{p.discount_text}</div>}
        </div>
      </div>
      {p.has_code && (p.code ? (
        <div className="flex items-center gap-2 mt-3">
          <code className="flex-1 text-center font-pixel text-sm py-2.5 rounded border border-gold" style={{ color: "var(--gold)" }}>{p.code}</code>
          <button className="btn btn-ghost !px-3 text-xs" onClick={() => void copy()}>Copy</button>
        </div>
      ) : p.sold_out ? <p className="text-xs text-muted-fg mt-3">All discount codes are claimed for now. More are on the way.</p>
        : <button className="btn btn-gold w-full mt-3" disabled={busy} onClick={() => void reveal()}>{busy ? "…" : "🎁 Reveal my discount code"}</button>)}
      {p.merch_url && <button className="btn btn-pink w-full mt-2" onClick={() => void openMerch(p)}>🛍️ {p.merch_label || "Open the store"}</button>}
      {p.has_code && p.code && <p className="text-[11px] text-muted-fg mt-2">Enter the code at checkout. The store, not TourStar, sells and ships the merch.</p>}
    </Card>
  );
}
