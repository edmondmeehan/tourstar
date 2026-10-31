// Store → Merch: real TourStar-branded merch. Buying unlocks matching in-game items on your account.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Modal, toast } from "../components/ui";
import { itemLabel } from "../game/cosmetics";
import { buyMerch, loadProducts, money, useMerch, vipCode, type MerchProduct } from "../lib/merch";
import { supabase, useCloud } from "../lib/cloud";
import { useGold } from "../lib/gold";
import { useGame } from "../game/store";

interface MyOrder { id: number; order_number: string; total: number; currency: string; created_at: string; items: { title: string; qty: number }[] }

export function MerchTab() {
  const { cfg, products, unlocks, error } = useMerch();
  const signedIn = useCloud((s) => !!s.session);
  const [open, setOpen] = useState<MerchProduct | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const crew = useGold((s) => s.owned.some((o) => o.items.some((i) => i.type === "badge" && i.name === "Merch Crew")));
  const wearing = useGame((s) => s.career?.style?.badge === "👕");
  useEffect(() => {
    void loadProducts();
    void vipCode().then(setCode);
    if (signedIn) void supabase!.from("merch_orders").select("id, order_number, total, currency, created_at, items").order("created_at", { ascending: false }).limit(10).then((r) => setOrders((r.data ?? []) as MyOrder[]));
  }, [signedIn]);

  if (cfg && !cfg.enabled) return <Card><p className="text-sm text-muted-fg text-center py-6">👕 TourStar merch is coming soon.</p></Card>;

  return (
    <div>
      <Card glow="gold" className="mb-4">
        <div className="font-pixel text-[9px]" style={{ color: "var(--gold)" }}>👕 OFFICIAL TOURSTAR MERCH</div>
        <p className="text-xs text-muted-fg mt-2">Real gear, printed and shipped to your door. Every order also unlocks in-game items and the 👕 Merch Crew badge on your account.</p>
        {code ? <p className="text-xs mt-2" style={{ color: "var(--gold)" }}>👑 VIP discount <b>{code}</b> is applied at checkout.</p>
          : <p className="text-[11px] text-muted-fg mt-2">TourStar VIP members get a merch discount. <Link to="/premium" className="underline">See VIP</Link></p>}
        {crew && <p className="text-xs mt-2">👕 You're <b>Merch Crew</b>. {wearing ? "It shows next to your name." : <Link to="/look" className="underline" style={{ color: "var(--gold)" }}>Wear the badge</Link>}</p>}
        {!signedIn && <p className="text-[11px] mt-2">Sign in before you buy so your in-game unlocks land on your account. <Link to="/login" className="underline">Sign in</Link></p>}
      </Card>

      {!products ? <p className="text-sm text-muted-fg text-center py-6">Loading merch…</p>
        : error ? <Card><p className="text-sm text-muted-fg text-center py-4">{error === "not-connected" ? "👕 TourStar merch is coming soon." : "Couldn't load the store. Try again in a moment."}</p></Card>
        : products.length === 0 ? <Card><p className="text-sm text-muted-fg text-center py-4">New merch is on the way.</p></Card>
        : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => {
              const u = unlocks[p.numericId];
              const soldOut = !p.variants.some((v) => v.availableForSale);
              return (
                <button key={p.id} className="panel text-left overflow-hidden" onClick={() => setOpen(p)}>
                  {p.image ? <img src={p.image} alt="" className="w-full aspect-square object-cover bg-black/30" loading="lazy" /> : <div className="w-full aspect-square bg-black/30 flex items-center justify-center text-4xl">👕</div>}
                  <div className="p-2.5">
                    <div className="text-sm font-semibold leading-tight line-clamp-2">{p.title}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--gold)" }}>{soldOut ? "Sold out" : `${new Set(p.variants.map((v) => v.price.amount)).size > 1 ? "from " : ""}${money(p.price)}`}</div>
                    {u?.length ? <div className="text-[10px] text-muted-fg mt-1">🎁 Unlocks {u.length} in-game item{u.length > 1 ? "s" : ""}</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}

      {orders.length > 0 && (
        <div className="mt-6">
          <h2 className="font-pixel text-[10px] mb-2 text-muted-fg">MY MERCH ORDERS</h2>
          <ul className="space-y-1.5">{orders.map((o) => (
            <li key={o.id} className="panel px-3 py-2 text-xs flex justify-between gap-2"><span className="truncate">{o.order_number} · {o.items.map((i) => `${i.qty}× ${i.title}`).join(", ")}</span><span className="text-muted-fg whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</span></li>
          ))}</ul>
          <p className="text-[11px] text-muted-fg mt-2">Shipping updates come from the store by email.</p>
        </div>
      )}
      <p className="text-[11px] text-muted-fg text-center mt-5">Sold and shipped by TourStar, LLC through Shopify. Merch never includes reward points or raffle entries.</p>

      {open && <ProductSheet p={open} onClose={() => setOpen(null)} vip={!!code} />}
    </div>
  );
}

function ProductSheet({ p, onClose, vip }: { p: MerchProduct; onClose: () => void; vip: boolean }) {
  const unlocks = useMerch((s) => s.unlocks[p.numericId]);
  const available = p.variants.filter((v) => v.availableForSale);
  const [variant, setVariant] = useState(available[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const v = p.variants.find((x) => x.id === variant);
  const buy = async () => {
    if (!variant) return;
    setBusy(true);
    const r = await buyMerch(variant);
    setBusy(false);
    toast(r);
    if (r.ok) onClose();
  };
  return (
    <Modal open onClose={onClose}>
      {p.image && <img src={p.image} alt="" className="w-full max-h-64 object-contain rounded mb-3 bg-black/30" />}
      <h3 className="font-bold">{p.title}</h3>
      <div className="text-sm mt-1" style={{ color: "var(--gold)" }}>{v ? money(v.price) : money(p.price)}{vip && <span className="text-xs text-muted-fg"> · VIP discount at checkout</span>}</div>
      {p.description && <p className="text-xs text-muted-fg mt-2 max-h-28 overflow-y-auto">{p.description}</p>}
      {p.variants.length > 1 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {p.variants.map((x) => (
            <button key={x.id} disabled={!x.availableForSale} onClick={() => setVariant(x.id)}
              className={`px-3 py-1.5 rounded border text-xs ${variant === x.id ? "border-pink text-pink" : "border-line"} ${x.availableForSale ? "" : "opacity-40 line-through"}`}>{x.title}</button>
          ))}
        </div>
      )}
      <div className="panel p-2 mt-3 text-xs">
        <div className="text-muted-fg mb-1">Also unlocks in TourStar:</div>
        <ul className="space-y-0.5">{(unlocks ?? []).map((it, i) => <li key={i}>{itemLabel(it)}</li>)}<li>👕 Merch Crew badge</li></ul>
      </div>
      <button className="btn btn-gold w-full mt-4" disabled={!variant || busy} onClick={() => void buy()}>{busy ? "Opening checkout…" : available.length ? "Buy" : "Sold out"}</button>
      <button className="text-xs underline text-muted-fg mt-3 block mx-auto" onClick={onClose}>Close</button>
    </Modal>
  );
}
