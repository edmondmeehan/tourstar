import { PREMIUM_SKUS, useMembership, type Sku } from "../game/settings";
import { useGame } from "../game/store";
import { Card, PageTitle, Tag, toast } from "../components/ui";
import { buy, isEntitlementSku, purchasesAvailable, restore, usePurchases } from "../lib/purchases";
import { sfx } from "../lib/fx";
import { useState } from "react";

export default function Premium() {
  const m = useMembership();
  const grantCash = useGame((s) => s.grantCash);
  const { status, products } = usePurchases();
  const [busy, setBusy] = useState<Sku | null>(null);
  const real = purchasesAvailable();
  const dev = import.meta.env.DEV;

  const owned = (sku: Sku) => (sku === "remove_timers" && m.removeTimers) || (sku === "premium_pass" && m.premiumPass) || (sku === "vip_badge" && m.vipBadge);

  const purchase = async (sku: Sku) => {
    if (!real) {
      // Development builds only: test the perks without a store.
      m.buy(sku);
      if (sku === "cash_small") grantCash(100_000, "Test purchase: $100K cash pack.");
      if (sku === "cash_large") grantCash(1_000_000, "Test purchase: $1M cash pack.");
      toast({ ok: true, title: "Test purchase", message: "Development build: nothing was charged." });
      return;
    }
    setBusy(sku);
    const r = await buy(sku);
    setBusy(null);
    if (r.cancelled) return;
    toast(r);
    if (r.ok) sfx("levelup");
  };

  return (
    <div>
      <PageTitle title="PREMIUM" sub="Extras that support the game. Reward points can't be bought." />
      {!real && !dev && (
        <Card className="mb-4" glow="gold"><p className="text-sm">Premium extras are available in the TourStar app for iPhone and Android.</p></Card>
      )}
      {real && status === "error" && (
        <Card className="mb-4"><p className="text-sm">The store isn't reachable right now. Check your connection and try again.</p></Card>
      )}
      <div className="space-y-3">
        {PREMIUM_SKUS.map((p) => {
          const has = isEntitlementSku(p.sku) && owned(p.sku);
          const product = products[p.sku];
          const price = real ? product?.priceString : dev ? `$${p.price}` : null;
          return (
            <Card key={p.sku} glow={has ? "gold" : undefined} className="flex items-center gap-3">
              <div className="text-3xl">{p.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{p.name}</div>
                <div className="text-xs text-muted-fg">{p.blurb}</div>
              </div>
              {has ? <Tag color="var(--gold)">OWNED</Tag> : price ? (
                <button className="btn btn-gold !px-3" disabled={busy !== null} onClick={() => void purchase(p.sku)}>{busy === p.sku ? "…" : price}</button>
              ) : real && status === "loading" ? <span className="text-xs text-muted-fg">Loading…</span> : null}
            </Card>
          );
        })}
      </div>
      {real && (
        <button className="text-xs underline text-muted-fg mt-5 block mx-auto" onClick={async () => toast(await restore())}>Restore purchases</button>
      )}
      <p className="text-[11px] text-muted-fg text-center mt-4">Payment is charged to your Apple ID or Google account. Purchases unlock in-game extras only. <a className="underline" href="https://tourstarapp.com/terms">Terms</a> · <a className="underline" href="https://tourstarapp.com/privacy">Privacy</a></p>
    </div>
  );
}
