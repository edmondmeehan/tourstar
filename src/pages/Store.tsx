import { useState } from "react";
import { STORE, type StoreItem } from "../game/data";
import { fmtMoney, levelFor } from "../game/engine";
import { useGame } from "../game/store";
import { Card, DeltaChips, PageTitle, Tag, toast } from "../components/ui";

const CATS: StoreItem["category"][] = ["VIP", "Merch", "Records", "Tickets", "Wellness"];

export default function Store() {
  const c = useGame((s) => s.career)!;
  const buy = useGame((s) => s.buy);
  const [cat, setCat] = useState<StoreItem["category"] | "All">("All");
  const lvl = levelFor(c.stats.fame).level;
  const items = STORE.filter((i) => cat === "All" || i.category === cat);

  return (
    <div>
      <div className="panel p-4 mb-4 text-center" style={{ borderColor: "var(--gold)", background: "linear-gradient(135deg, oklch(20% .08 340), oklch(16% .06 270))" }}>
        <div className="font-pixel text-[8px] text-muted-fg">THE</div>
        <div className="font-logo text-2xl my-1" style={{ color: "var(--gold)" }}>Please &amp; Thank You</div>
        <div className="font-pixel text-[8px] text-muted-fg">STORE</div>
      </div>
      <PageTitle title="SHOP" sub="Spend game cash on boosts." right={<span className="font-pixel text-[10px]" style={{ color: "var(--success)" }}>{fmtMoney(c.stats.cash)}</span>} />
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 -mx-4 px-4">
        {(["All", ...CATS] as const).map((k) => (
          <button key={k} onClick={() => setCat(k)} className={`font-pixel text-[8px] px-3 py-2 rounded-full border shrink-0 ${cat === k ? "border-pink text-pink" : "border-line text-muted-fg"}`}>{k.toUpperCase()}</button>
        ))}
      </div>
      <div className="space-y-3">
        {items.map((i) => {
          const locked = lvl < i.level;
          return (
            <Card key={i.id} className={locked ? "opacity-50" : ""}>
              <div className="flex gap-3">
                <div className="text-3xl">{i.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-sm">{i.name}</div>
                    <Tag>{i.category}</Tag>
                  </div>
                  <p className="text-xs text-muted-fg mt-1">{i.blurb}</p>
                  <DeltaChips delta={i.effects} className="mt-2" />
                </div>
              </div>
              {locked ? (
                <div className="mt-3 text-center"><Tag color="var(--gold)">UNLOCKS AT LV{i.level}</Tag></div>
              ) : (
                <button className="btn btn-gold w-full mt-3" disabled={c.stats.cash < i.price} onClick={() => toast(buy(i.id))}>Buy · {fmtMoney(i.price)}</button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
