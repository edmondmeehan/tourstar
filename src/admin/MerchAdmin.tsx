// Admin → Merch: connect the TourStar Shopify store, choose what each product unlocks in the game, see orders.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { toast } from "../components/ui";
import { MOVES, SKIN_PRESETS, STAGE_THEMES, itemLabel, type DropItem, type MoveId } from "../game/cosmetics";
import { LOOK_ITEMS } from "../game/looks";
import { loadMerchConfig, loadProducts, money, type MerchProduct } from "../lib/merch";
import { Kpi, Section, fail, input, when } from "./kit";

const KEYS = ["merch_enabled", "merch_shop_domain", "merch_collection", "merch_api_version"] as const;
type ItemType = "badge" | "title" | "stage" | "skin" | "moves" | "look";
interface Order { id: number; order: string; email: string | null; player: string | null; total: number; currency: string; items: { title: string; variant: string | null; qty: number }[]; unlocked: number; at: string }

export function MerchAdminTab() {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [hasToken, setHasToken] = useState(false);
  const [products, setProducts] = useState<MerchProduct[] | null>(null);
  const [prodErr, setProdErr] = useState<string | null>(null);
  const [unlocks, setUnlocks] = useState<Record<string, DropItem[]>>({});
  const [sum, setSum] = useState<{ orders_30d: number; revenue_30d: number; players_30d: number; recent: Order[] } | null>(null);

  const load = useCallback(async () => {
    const [c, u, s] = await Promise.all([
      supabase!.from("app_public_config").select("key, value").in("key", [...KEYS, "shopify_storefront_token"]),
      supabase!.from("merch_unlocks").select("product_id, items"),
      supabase!.rpc("admin_merch_summary"),
    ]);
    if (s.error) return fail(s.error.message.includes("admin_merch_summary") ? { message: "Run SQL-8-MERCH.sql in Supabase to turn on merch." } : s.error);
    const m = Object.fromEntries((c.data ?? []).map((x) => [x.key, String(x.value ?? "")]));
    setHasToken(!!m.shopify_storefront_token);
    setCfg(m); setDraft(m);
    setUnlocks(Object.fromEntries((u.data ?? []).map((r) => [r.product_id, r.items as DropItem[]])));
    setSum(s.data);
    const conf = await loadMerchConfig();
    if (conf?.domain && conf.token) {
      const ps = await loadProducts(conf);
      setProducts(ps);
      setProdErr(ps.length ? null : "No products found. Check the store domain, the token's product permissions and the collection handle.");
    } else { setProducts([]); setProdErr(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveCfg = async () => {
    const rows = KEYS.map((k) => ({ key: k, value: (draft[k] ?? "").trim(), updated_at: new Date().toISOString() }));
    const { error } = await supabase!.from("app_public_config").upsert(rows);
    if (error) return fail(error);
    toast({ ok: true, message: draft.merch_enabled === "true" ? "Saved. The Merch tab is live in the Store." : "Saved." });
    void load();
  };

  const saveUnlock = async (p: MerchProduct, items: DropItem[]) => {
    const { error } = items.length
      ? await supabase!.from("merch_unlocks").upsert({ product_id: p.numericId, title: p.title, items, active: true })
      : await supabase!.from("merch_unlocks").delete().eq("product_id", p.numericId);
    if (error) return fail(error);
    setUnlocks((u) => ({ ...u, [p.numericId]: items }));
    toast({ ok: true, message: `Saved what "${p.title}" unlocks.` });
  };

  const dirty = KEYS.some((k) => (draft[k] ?? "") !== (cfg[k] ?? ""));

  return (
    <>
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Kpi label="Merch orders · 30d" value={sum?.orders_30d ?? "—"} />
        <Kpi label="Merch revenue · 30d" value={sum ? `$${Number(sum.revenue_30d).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"} sub="Before Shopify and print costs" />
        <Kpi label="Players who bought · 30d" value={sum?.players_30d ?? "—"} />
      </div>

      <Section title="Store connection" sub="TourStar merch is sold through your Shopify store with a print-on-demand app (Printful or Printify) making and shipping each item. The game shows the products and opens Shopify checkout; physical goods can't go through Apple's in-app purchase.">
        <ol className="text-xs text-muted-fg list-decimal pl-5 space-y-1 mb-4">
          <li>Create the Shopify store and add the Printful or Printify app. Design the items there and publish them to Shopify.</li>
          <li>Optional: put the items in a collection (e.g. handle <code>tourstar</code>) and enter it below; otherwise every product shows.</li>
          <li>Get a Storefront API token (Shopify → Settings → Apps → Develop apps, or the Headless channel) and paste it in Integrations → Merch.</li>
          <li>Add the "Order payment" webhook and its signing secret, and the VIP discount code, in Integrations → Merch.</li>
        </ol>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="block text-xs text-muted-fg">Store domain<input className={`${input} mt-1`} placeholder="tourstar.myshopify.com" value={draft.merch_shop_domain ?? ""} onChange={(e) => setDraft({ ...draft, merch_shop_domain: e.target.value })} /></label>
          <label className="block text-xs text-muted-fg">Collection handle (optional)<input className={`${input} mt-1`} placeholder="tourstar" value={draft.merch_collection ?? ""} onChange={(e) => setDraft({ ...draft, merch_collection: e.target.value })} /></label>
          <label className="block text-xs text-muted-fg">Storefront API version<input className={`${input} mt-1`} placeholder="2026-07" value={draft.merch_api_version ?? ""} onChange={(e) => setDraft({ ...draft, merch_api_version: e.target.value })} /></label>
        </div>
        <p className="text-[11px] mt-2">{hasToken ? "✅ Storefront token saved in Integrations." : "⚠️ No Storefront token yet: add it in Integrations → Merch."}</p>
        <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={draft.merch_enabled === "true"} onChange={(e) => setDraft({ ...draft, merch_enabled: String(e.target.checked) })} />Show the Merch tab in the game's Store</label>
        <button className="btn btn-pink mt-3" disabled={!dirty} onClick={() => void saveCfg()}>Save</button>
      </Section>

      <Section title="Products and in-game unlocks" sub="Pick what each product unlocks in the game when it's bought (stages, titles, badges, app colors, dance moves). Every order also gives the 👕 Merch Crew badge. Merch never gives points, Gold or raffle entries.">
        {!products ? <p className="text-sm text-muted-fg">Loading…</p>
          : prodErr ? <p className="text-sm text-danger">{prodErr}</p>
          : products.length === 0 ? <p className="text-sm text-muted-fg">Connect the store above to see products.</p>
          : <div className="space-y-3">{products.map((p) => <ProductUnlock key={p.id} p={p} items={unlocks[p.numericId] ?? []} onSave={(items) => void saveUnlock(p, items)} />)}</div>}
      </Section>

      <Section title="Recent orders" sub="Paid orders reported by Shopify. Fulfillment and shipping are handled in Shopify and your print-on-demand app.">
        {!sum?.recent.length ? <p className="text-sm text-muted-fg">No orders yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px] [&_th]:px-2 [&_td]:px-2">
              <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left"><tr className="border-b border-line"><th className="py-2">Order</th><th>Buyer</th><th>Items</th><th className="text-right">Total</th><th>Unlocked</th><th>When</th></tr></thead>
              <tbody>{sum.recent.map((o) => (
                <tr key={o.id} className="border-b border-line/50">
                  <td className="py-2">{o.order}</td>
                  <td className="text-xs">{o.player ?? <span className="text-muted-fg">no account</span>}<span className="text-muted-fg">{o.email ? ` · ${o.email}` : ""}</span></td>
                  <td className="text-xs">{o.items.map((i) => `${i.qty}× ${i.title}${i.variant ? ` (${i.variant})` : ""}`).join(", ")}</td>
                  <td className="text-right tabular-nums">{money({ amount: String(o.total), currencyCode: o.currency })}</td>
                  <td className="text-xs">{o.player ? `${o.unlocked + 1} items` : "—"}</td>
                  <td className="text-xs text-muted-fg whitespace-nowrap">{when(o.at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function ProductUnlock({ p, items: initial, onSave }: { p: MerchProduct; items: DropItem[]; onSave: (items: DropItem[]) => void }) {
  const [items, setItems] = useState<DropItem[]>(initial);
  const [add, setAdd] = useState<ItemType>("badge");
  useEffect(() => setItems(initial), [initial]);
  const blank = (t: ItemType): DropItem => t === "badge" ? { type: "badge", emoji: "👕", name: p.title.slice(0, 32) } : t === "title" ? { type: "title", name: "" }
    : t === "stage" ? { type: "stage", id: STAGE_THEMES[1].id } : t === "skin" ? { type: "skin", ...SKIN_PRESETS[0] } : t === "look" ? { type: "look", id: LOOK_ITEMS.find((x) => x.source === "merch")!.id } : { type: "moves", id: "step", members: 1 };
  const set = (i: number, it: DropItem) => setItems(items.map((x, j) => (j === i ? it : x)));
  const changed = JSON.stringify(items) !== JSON.stringify(initial);

  return (
    <div className="panel p-3 flex gap-3">
      {p.image ? <img src={p.image} alt="" className="w-16 h-16 rounded object-cover shrink-0" /> : <div className="w-16 h-16 rounded bg-black/30 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{p.title} <span className="text-muted-fg font-normal text-xs">· {money(p.price)} · {p.variants.length} variant{p.variants.length > 1 ? "s" : ""}</span></div>
        <ul className="mt-2 space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
              {it.type === "badge" && <><input className={`${input} !w-14 text-center`} maxLength={4} value={it.emoji} onChange={(e) => set(i, { ...it, emoji: e.target.value })} /><input className={`${input} flex-1 min-w-[8rem]`} maxLength={32} value={it.name ?? ""} onChange={(e) => set(i, { ...it, name: e.target.value })} placeholder="Badge name" /></>}
              {it.type === "title" && <input className={`${input} flex-1`} maxLength={32} value={it.name} onChange={(e) => set(i, { ...it, name: e.target.value })} placeholder="Title, e.g. Hoodie Season" />}
              {it.type === "stage" && <select className={`${input} !w-auto`} value={it.id} onChange={(e) => set(i, { ...it, id: e.target.value })}>{STAGE_THEMES.filter((t) => t.id !== "classic").map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}</select>}
              {it.type === "skin" && <><input className={`${input} !w-32`} maxLength={32} value={it.name} onChange={(e) => set(i, { ...it, name: e.target.value })} />{(["a", "b", "bg"] as const).map((k) => <input key={k} type="color" className="w-8 h-7 bg-transparent" value={it[k]} onChange={(e) => set(i, { ...it, [k]: e.target.value.toUpperCase() })} />)}</>}
              {it.type === "look" && <select className={`${input} !w-auto`} value={it.id} onChange={(e) => set(i, { type: "look", id: e.target.value })}>{LOOK_ITEMS.filter((x) => x.source === "merch" || x.source === "gold").map((x) => <option key={x.id} value={x.id}>{x.name} ({x.slot})</option>)}</select>}
              {it.type === "moves" && <select className={`${input} !w-auto`} value={it.id} onChange={(e) => set(i, { ...it, id: e.target.value as MoveId })}>{MOVES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
              <span className="text-muted-fg">{itemLabel(it)}</span>
              <button className="underline text-danger" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-2">
          <select className={`${input} !w-auto text-xs`} value={add} onChange={(e) => setAdd(e.target.value as ItemType)}>
            <option value="badge">Badge</option><option value="title">Title</option><option value="stage">Stage theme</option><option value="skin">App colors</option><option value="moves">Dance moves</option><option value="look">Outfit (look item)</option>
          </select>
          <button className="btn btn-ghost text-xs" onClick={() => setItems([...items, blank(add)])}>+ Add unlock</button>
          <button className="btn btn-pink text-xs" disabled={!changed} onClick={() => onSave(items.filter((it) => it.type !== "title" || it.name.trim()))}>Save</button>
        </div>
      </div>
    </div>
  );
}
