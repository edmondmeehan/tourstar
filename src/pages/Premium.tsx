import { useState } from "react";
import { Link } from "react-router-dom";
import { PREMIUM_SKUS, VIP_PERKS, useMembership, type Sku } from "../game/settings";
import { useGame } from "../game/store";
import { Card, PageTitle, Tag, toast } from "../components/ui";
import { buy, manageSubscription, needsAccount, purchasesAvailable, restore, showVipPaywall, usePurchases } from "../lib/purchases";
import { useAiFlags } from "../lib/ai";
import { useGold } from "../lib/gold";
import { useCloud } from "../lib/cloud";
import { sfx } from "../lib/fx";

const def = (sku: Sku) => PREMIUM_SKUS.find((p) => p.sku === sku)!;

export default function Premium() {
  const m = useMembership();
  const grantCash = useGame((s) => s.grantCash);
  const { status, products } = usePurchases();
  const credits = useAiFlags((s) => s.credits);
  const gold = useGold((s) => s.gold);
  const aiOn = useAiFlags((s) => s.music);
  const signedIn = useCloud((s) => !!s.session);
  const [busy, setBusy] = useState<Sku | "paywall" | null>(null);
  const real = purchasesAvailable();
  const dev = import.meta.env.DEV;
  const vip = m.premiumPass;

  const price = (sku: Sku) => (real ? products[sku]?.priceString : dev ? `$${def(sku).price}` : null);
  /** On the website there's no App Store, so show the list price and point to the app. */
  const webOnly = !real && !dev;
  const listPrice = (sku: Sku) => `$${def(sku).price}`;

  const purchase = async (sku: Sku) => {
    if (needsAccount(sku) && !signedIn) return toast({ ok: false, message: "Sign in first (Account tab) so your purchase is saved to your account." });
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

  /** RevenueCat's designed paywall; if none is set up in RevenueCat yet, the buttons below still work. */
  const openPaywall = async () => {
    setBusy("paywall");
    const r = await showVipPaywall();
    setBusy(null);
    if (r.result === "unavailable") return toast({ ok: true, message: "Pick monthly or yearly below." });
    if (r.message) toast(r);
    if (r.ok) sfx("levelup");
  };

  const BuyButton = ({ sku, className = "btn-gold" }: { sku: Sku; className?: string }) => {
    const p = price(sku);
    if (webOnly) return <span className="text-xs text-muted-fg text-right whitespace-nowrap"><b className="text-fg">{listPrice(sku)}</b><br />in the app</span>;
    if (!p) return real && status === "loading" ? <span className="text-xs text-muted-fg">Loading…</span> : null;
    return <button className={`btn ${className} !px-3 whitespace-nowrap`} disabled={busy !== null} onClick={() => void purchase(sku)}>{busy === sku ? "…" : p}</button>;
  };

  const Row = ({ sku }: { sku: Sku }) => (
    <Card className="flex items-center gap-3">
      <div className="text-3xl">{def(sku).emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm">{def(sku).name}</div>
        <div className="text-xs text-muted-fg">{def(sku).blurb}</div>
      </div>
      <BuyButton sku={sku} />
    </Card>
  );

  return (
    <div>
      <PageTitle title="PREMIUM" sub="Extras that support the game. Reward points and raffle entries can't be bought." />
      {!real && !dev && (
        <Card className="mb-4" glow="gold"><p className="text-sm">Purchases are made in the TourStar app for iPhone and Android, through your App Store or Google Play account. Prices below are for reference.</p></Card>
      )}
      {real && status === "error" && (
        <Card className="mb-4"><p className="text-sm">The store isn't reachable right now. Check your connection and try again.</p></Card>
      )}

      {/* ---------------- VIP subscription */}
      <Card glow="gold" className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="font-pixel text-sm" style={{ color: "var(--gold)" }}>👑 TOURSTAR VIP</div>
          {vip && <Tag color="var(--gold)">ACTIVE</Tag>}
        </div>
        <ul className="text-sm mt-3 space-y-1.5">
          {VIP_PERKS.map((p) => <li key={p}>{p}</li>)}
        </ul>
        {vip ? (
          <>
            <p className="text-xs text-muted-fg mt-4">Thanks for being a VIP. Change plans, cancel or get help any time.</p>
            <button className="btn btn-ghost w-full mt-3 text-xs" onClick={() => void manageSubscription()}>Manage subscription</button>
          </>
        ) : (
          <>
          {real && status === "ready" && (
            <button className="btn btn-gold w-full mt-4" disabled={busy !== null} onClick={() => void openPaywall()}>{busy === "paywall" ? "…" : "👑 See VIP plans"}</button>
          )}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {(["vip_monthly", "vip_yearly"] as const).map((sku) => {
              const p = price(sku) ?? (webOnly ? listPrice(sku) : null);
              return (
                <button key={sku} className={`btn ${sku === "vip_yearly" ? "btn-gold" : "btn-pink"} flex flex-col items-center !py-2`} disabled={webOnly || !price(sku) || busy !== null} onClick={() => void purchase(sku)}>
                  <span className="text-sm font-bold">{busy === sku ? "…" : p ?? "—"}</span>
                  <span className="text-[10px] opacity-80">{sku === "vip_yearly" ? "per year · save 33%" : "per month"}{webOnly ? " · in the app" : ""}</span>
                </button>
              );
            })}
          </div>
          </>
        )}
      </Card>

      {/* ---------------- Gold Records */}
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-pixel text-[10px]" style={{ color: "var(--gold)" }}>💿 GOLD RECORDS</h2>
        {signedIn && <span className="text-xs text-muted-fg">Balance: {gold.toLocaleString()}</span>}
      </div>
      <p className="text-xs text-muted-fg mb-3">Spend Gold on limited drops in the Store: stage themes, titles, badges and official artist packs. Gold can't be turned into reward points.</p>
      <div className="space-y-3 mb-5">{(["gold_100", "gold_550", "gold_1200", "gold_2500"] as const).map((s) => <Row key={s} sku={s} />)}</div>

      {/* ---------------- AI studio */}
      {aiOn && (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-pixel text-[10px]" style={{ color: "var(--neon-pink)" }}>AI STUDIO</h2>
            {signedIn && <span className="text-xs text-muted-fg">{credits} extra song{credits === 1 ? "" : "s"} left</span>}
          </div>
          <p className="text-xs text-muted-fg mb-3">Every release can come with a real AI recording. You get free songs every day; these packs add more. {!signedIn && <Link to="/login" className="underline">Sign in</Link>}</p>
          <div className="space-y-3 mb-5"><Row sku="ai_songs_5" /><Row sku="ai_songs_15" /></div>
        </>
      )}

      {/* ---------------- cash */}
      <h2 className="font-pixel text-[10px] mb-2" style={{ color: "var(--electric)" }}>GAME CASH</h2>
      <div className="space-y-3"><Row sku="cash_small" /><Row sku="cash_large" /></div>

      {real && (
        <button className="text-xs underline text-muted-fg mt-5 block mx-auto" onClick={async () => toast(await restore())}>Restore purchases</button>
      )}
      <p className="text-[11px] text-muted-fg text-center mt-4 leading-relaxed">
        VIP is an auto-renewing subscription: {price("vip_monthly") ?? "$4.99"} a month or {price("vip_yearly") ?? "$39.99"} a year. Payment is charged to your Apple ID or Google account when you confirm.
        It renews automatically unless you turn off auto-renew at least 24 hours before the end of the current period, and you can manage or cancel it in your account settings.
        Purchases unlock in-game extras only and never buy reward points or raffle entries.{" "}
        <a className="underline" href="https://tourstarapp.com/terms">Terms of Use</a> · <a className="underline" href="https://tourstarapp.com/privacy">Privacy</a>
      </p>
    </div>
  );
}
