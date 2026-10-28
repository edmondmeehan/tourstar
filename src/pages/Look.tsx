// My Look: build your artist's pixel look. Starter items are free; more come from cash, levels, Gold drops,
// artist packs and real merch. Cosmetic only.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Card, PageTitle, Tag, toast } from "../components/ui";
import { useGame } from "../game/store";
import { fmtMoney } from "../game/engine";
import { BODIES, HAIR_COLORS, LOOK_ITEMS, SKIN_TONES, SLOTS, lookOwned, normalizeLook, type Look, type LookItem, type Slot } from "../game/looks";
import { ownedItems, useGold } from "../lib/gold";
import { sfx } from "../lib/fx";

const SOURCE_TAG: Record<string, string> = { gold: "💿 DROP", merch: "👕 MERCH", level: "⭐ LEVEL" };

export default function LookPage() {
  const c = useGame((s) => s.career)!;
  const setLook = useGame((s) => s.setLook);
  const buyLook = useGame((s) => s.buyLook);
  useGold((s) => s.owned);
  const saved = useMemo(() => normalizeLook(c.look, c.genre), [c.look, c.genre]);
  const [draft, setDraft] = useState<Look>(saved);
  const [slot, setSlot] = useState<Slot | "base">("base");
  const drops = new Set(ownedItems().filter((i): i is { type: "look"; id: string } => i.type === "look").map((i) => i.id));
  const owned = (it: LookItem) => lookOwned(it, c, drops);
  const unowned = (["hair", "top", "bottom", "shoes", "acc", "held"] as Slot[]).map((s) => LOOK_ITEMS.find((i) => i.id === draft[s])!).filter((it) => !owned(it));
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = () => {
    if (unowned.length) return toast({ ok: false, message: `You're trying on ${unowned.map((u) => u.name).join(", ")}. Get ${unowned.length > 1 ? "them" : "it"} first, or switch back.` });
    setLook(draft);
    sfx("levelup");
    toast({ ok: true, title: "Looking good", message: "Your new look is on stage." });
  };

  const buy = (it: LookItem) => {
    const r = buyLook(it.id);
    toast(r);
    if (r.ok) sfx("coin");
  };

  return (
    <div>
      <PageTitle title="MY LOOK" sub="Build your stage look. It shows on stage, at home and on the leaderboard." />
      <Card glow="pink" className="mb-4">
        <div className="flex items-end gap-4">
          <div className="rounded-lg p-2" style={{ background: "radial-gradient(circle at 50% 40%, oklch(30% .12 300), transparent 70%)" }}>
            <Avatar look={draft} size={180} title={`${c.name}'s look`} />
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <div className="font-bold truncate">{c.name}</div>
            {unowned.length > 0 && <p className="text-[11px] mt-1" style={{ color: "var(--gold)" }}>Trying on: {unowned.map((u) => u.name).join(", ")}</p>}
            <div className="flex flex-col gap-2 mt-3">
              <button className="btn btn-pink !py-2 text-xs" disabled={!changed} onClick={save}>Save look</button>
              {changed && <button className="text-[11px] underline text-muted-fg" onClick={() => setDraft(saved)}>Undo changes</button>}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-3">
        {([{ id: "base", name: "You", emoji: "🙂" }, ...SLOTS] as { id: Slot | "base"; name: string; emoji: string }[]).map((s) => (
          <button key={s.id} onClick={() => setSlot(s.id)} className={`shrink-0 px-3 py-2 rounded-full border text-xs ${slot === s.id ? "border-pink text-pink bg-black/30" : "border-line text-muted-fg"}`}>{s.emoji} {s.name}</button>
        ))}
      </div>

      {slot === "base" ? (
        <Card>
          <div className="text-xs text-muted-fg mb-2">Skin tone</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {SKIN_TONES.map((t, i) => <button key={t} aria-label={`Skin tone ${i + 1}`} onClick={() => setDraft({ ...draft, skin: i })} className={`w-9 h-9 rounded-full border-2 ${draft.skin === i ? "border-pink" : "border-transparent"}`} style={{ background: t }} />)}
          </div>
          <div className="text-xs text-muted-fg mb-2">Build</div>
          <div className="flex gap-2 mb-4">
            {BODIES.map((b) => <button key={b.id} onClick={() => setDraft({ ...draft, body: b.id })} className={`flex-1 px-3 py-2 rounded border text-xs ${draft.body === b.id ? "border-pink text-pink" : "border-line text-muted-fg"}`}>{b.name}</button>)}
          </div>
          <div className="text-xs text-muted-fg mb-2">Hair color</div>
          <div className="flex flex-wrap gap-2">
            {HAIR_COLORS.map((h, i) => <button key={h} aria-label={`Hair color ${i + 1}`} onClick={() => setDraft({ ...draft, hairColor: i })} className={`w-8 h-8 rounded-full border-2 ${draft.hairColor === i ? "border-pink" : "border-transparent"}`} style={{ background: h }} />)}
          </div>
          <p className="text-[11px] text-muted-fg mt-4">Skin, build and hair color are always free to change.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {LOOK_ITEMS.filter((it) => it.slot === slot).map((it) => {
            const have = owned(it);
            const on = draft[slot as Slot] === it.id;
            const tooLow = it.source === "cash" && (it.level ?? 1) > c.peakLevel;
            return (
              <div key={it.id} className={`panel p-2 text-center flex flex-col items-center ${on ? "!border-pink" : ""}`}>
                <button className="w-full flex flex-col items-center" onClick={() => setDraft({ ...draft, [slot]: it.id })} aria-pressed={on}>
                  <Avatar look={{ ...draft, [slot]: it.id }} size={72} />
                  <div className="text-[11px] mt-1 leading-tight">{it.name}</div>
                </button>
                <div className="mt-1.5 min-h-[26px] flex items-center">
                  {have ? (on ? <Tag color="var(--neon-pink)">WEARING</Tag> : <span className="text-[10px] text-muted-fg">Owned</span>)
                    : it.source === "cash" ? (tooLow ? <Tag color="var(--gold)">LV{it.level}</Tag>
                      : <button className="btn btn-primary !px-2 !py-1 text-[10px]" disabled={c.stats.cash < (it.price ?? 0)} onClick={() => buy(it)}>{fmtMoney(it.price ?? 0)}</button>)
                    : it.source === "level" ? <Tag color="var(--gold)">LV{it.level}</Tag>
                    : it.source === "gold" ? <Link to="/store?tab=drops" className="text-[10px] underline" style={{ color: "var(--gold)" }}>{SOURCE_TAG.gold}</Link>
                    : <Link to="/store?tab=merch" className="text-[10px] underline" style={{ color: "var(--gold)" }}>{SOURCE_TAG.merch}</Link>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-muted-fg text-center mt-4">Tap anything to try it on. ⭐ items unlock with levels, 💿 come in Store drops and artist packs, 👕 come with real TourStar merch. Looks never change your stats.</p>
    </div>
  );
}
