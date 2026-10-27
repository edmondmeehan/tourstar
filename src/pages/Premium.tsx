import { PREMIUM_SKUS, useMembership, type Sku } from "../game/settings";
import { useGame } from "../game/store";
import { Card, PageTitle, Tag, toast, askConfirm } from "../components/ui";

export default function Premium() {
  const m = useMembership();
  const grantCash = useGame((s) => s.grantCash);

  const owned = (sku: Sku) => (sku === "remove_timers" && m.removeTimers) || (sku === "premium_pass" && m.premiumPass) || (sku === "vip_badge" && m.vipBadge);

  const purchase = (sku: Sku) => {
    const def = PREMIUM_SKUS.find((p) => p.sku === sku)!;
    askConfirm(`Simulated purchase: ${def.name} for $${def.price}. No real charge.`, () => {
      m.buy(sku);
      if (sku === "cash_small") grantCash(100_000, "Bought a $100K cash pack.");
      if (sku === "cash_large") grantCash(1_000_000, "Bought a $1M cash pack.");
      toast({ ok: true, title: "Purchased", message: `${def.emoji} ${def.name} (simulated)` });
    }, { yes: `Buy $${def.price}` });
  };

  return (
    <div>
      <PageTitle title="PREMIUM" sub="Real-money extras." />
      <Card className="mb-4" glow="gold">
        <p className="text-sm">These are <b>simulated purchases</b> — nothing is charged. Real in-app purchases arrive with RevenueCat / App Store setup.</p>
      </Card>
      <div className="space-y-3">
        {PREMIUM_SKUS.map((p) => {
          const has = owned(p.sku);
          return (
            <Card key={p.sku} glow={has ? "gold" : undefined} className="flex items-center gap-3">
              <div className="text-3xl">{p.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{p.name}</div>
                <div className="text-xs text-muted-fg">{p.blurb}</div>
              </div>
              {has ? <Tag color="var(--gold)">OWNED</Tag> : <button className="btn btn-gold !px-3" onClick={() => purchase(p.sku)}>${p.price}</button>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
