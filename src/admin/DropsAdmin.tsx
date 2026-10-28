// Admin → Drops: create and schedule limited packs sold for Gold Records, see sales, manage Gold.
// Drops go live in the app at their start time with no app update.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { askConfirm, toast } from "../components/ui";
import { ITEM_TYPES, STAGE_THEMES, itemLabel, type DropItem } from "../game/cosmetics";
import type { Drop } from "../lib/gold";
import { Kpi, Section, fail, input, when } from "./kit";

type Row = Drop & { active: boolean; created_at: string };
interface Summary { gold_outstanding: number; gold_bought_30d: number; gold_spent_30d: number; holders: number; sales: Record<string, { count: number; gold: number }> }
type Form = Omit<Row, "id" | "created_at" | "was_gold" | "new_players_days" | "ends_at" | "image_url"> & {
  id?: string; was_gold: string; new_players_days: string; ends_at: string; image_url: string;
};

/** Value of 1 Gold in dollars, from the 1,200-for-$9.99 pack (before Apple's cut). */
const USD_PER_GOLD = 9.99 / 1200;
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
const inDays = (d: number) => local(new Date(Date.now() + d * 864e5).toISOString());

const TEMPLATES: Record<string, () => Form> = {
  "Starter pack": () => ({ name: "Starter Pack", emoji: "🚀", description: "A head start for new artists. One time only.", kind: "starter", price_gold: 100, was_gold: "400",
    items: [{ type: "stage", id: "neon-tokyo" }, { type: "cash", amount: 25000 }, { type: "energy", amount: 100 }, { type: "badge", emoji: "🚀", name: "Early Riser" }],
    starts_at: local(new Date().toISOString()), ends_at: "", new_players_days: "7", min_level: 1, active: false, sort: 0, image_url: "" }),
  "Weekly bundle": () => ({ name: "Inferno Weekend", emoji: "🔥", description: "Turn the stage into a furnace. This weekend only.", kind: "bundle", price_gold: 300, was_gold: "",
    items: [{ type: "stage", id: "inferno" }, { type: "title", name: "Fire Starter" }, { type: "cash", amount: 50000 }],
    starts_at: local(new Date().toISOString()), ends_at: inDays(3), new_players_days: "", min_level: 1, active: false, sort: 0, image_url: "" }),
  "Artist pack": () => ({ name: "[Artist] Official Tour Pack", emoji: "⭐", description: "The official [Artist] stage, title and badge. Limited to this tour event.", kind: "artist", price_gold: 800, was_gold: "",
    items: [{ type: "stage", id: "royal-gold", name: "[Artist] Tour Stage" }, { type: "title", name: "Opened for [Artist]" }, { type: "badge", emoji: "⭐", name: "[Artist] Crew" }],
    starts_at: local(new Date().toISOString()), ends_at: inDays(21), new_players_days: "", min_level: 1, active: false, sort: 0, image_url: "" }),
};

function status(d: Row, now = Date.now()) {
  if (!d.active) return { label: "HIDDEN", cls: "text-muted-fg border-line" };
  if (Date.parse(d.starts_at) > now) return { label: "SCHEDULED", cls: "text-electric border-electric" };
  if (d.ends_at && Date.parse(d.ends_at) <= now) return { label: "ENDED", cls: "text-muted-fg border-line" };
  return { label: "LIVE", cls: "text-success border-success" };
}

export function DropsTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [vipGold, setVipGold] = useState("150");
  const [grant, setGrant] = useState({ email: "", amount: "", reason: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, s, c] = await Promise.all([
      supabase!.from("drops").select("*").order("starts_at", { ascending: false }),
      supabase!.rpc("admin_drops_summary"),
      supabase!.from("app_public_config").select("value").eq("key", "vip_monthly_gold").maybeSingle(),
    ]);
    if (d.error) return fail(d.error);
    setRows(d.data as Row[]);
    if (!s.error) setSum(s.data as Summary);
    if (c.data?.value) setVipGold(String(c.data.value));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const edit = (d: Row, copy = false) => setForm({
    ...d, id: copy ? undefined : d.id, name: copy ? `${d.name} (copy)` : d.name, active: copy ? false : d.active,
    was_gold: d.was_gold === null ? "" : String(d.was_gold), new_players_days: d.new_players_days === null ? "" : String(d.new_players_days),
    starts_at: local(d.starts_at), ends_at: local(d.ends_at), image_url: d.image_url ?? "",
  });

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return toast({ ok: false, message: "Give the drop a name." });
    if (!form.items.length) return toast({ ok: false, message: "Add at least one item." });
    if (form.image_url && !form.image_url.startsWith("https://")) return toast({ ok: false, message: "Image links must start with https://" });
    const n = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))));
    const row = {
      name: form.name.trim(), description: form.description.trim(), emoji: form.emoji || "🎁", image_url: form.image_url.trim() || null,
      kind: form.kind, price_gold: Math.max(0, Math.round(form.price_gold)), was_gold: n(form.was_gold), items: form.items,
      starts_at: new Date(form.starts_at || Date.now()).toISOString(), ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      new_players_days: n(form.new_players_days) || null, min_level: form.min_level, active: form.active, sort: form.sort,
    };
    setBusy(true);
    const { error } = form.id ? await supabase!.from("drops").update(row).eq("id", form.id) : await supabase!.from("drops").insert(row);
    setBusy(false);
    if (error) return fail(error);
    toast({ ok: true, message: form.active ? "Saved. Players see it at its start time." : "Saved as hidden. Switch on \"Live\" when it's ready." });
    setForm(null);
    void load();
  };

  const toggle = (d: Row) => askConfirm(d.active ? `Hide "${d.name}"? Players who bought it keep it.` : `Make "${d.name}" live? It shows in the app from its start time.`, async () => {
    const { error } = await supabase!.from("drops").update({ active: !d.active }).eq("id", d.id);
    if (error) return fail(error);
    void load();
  }, { yes: d.active ? "Hide" : "Go live" });

  const remove = (d: Row) => askConfirm(`Delete "${d.name}"? Players who bought it keep their items. This can't be undone.`, async () => {
    const { error } = await supabase!.from("drops").delete().eq("id", d.id);
    if (error) return fail(error);
    void load();
  }, { yes: "Delete", danger: true });

  const saveVipGold = async () => {
    const v = String(Math.max(0, Math.round(Number(vipGold) || 0)));
    const { error } = await supabase!.from("app_public_config").upsert({ key: "vip_monthly_gold", value: v, updated_at: new Date().toISOString() });
    if (error) return fail(error);
    toast({ ok: true, message: `VIP members now get ${v} Gold a month (from their next payment).` });
  };

  const giveGold = () => {
    const amount = Math.round(Number(grant.amount));
    if (!grant.email.includes("@") || !amount) return toast({ ok: false, message: "Enter the player's email and an amount (negative to remove)." });
    askConfirm(`${amount > 0 ? "Give" : "Remove"} ${Math.abs(amount).toLocaleString()} Gold ${amount > 0 ? "to" : "from"} ${grant.email}?`, async () => {
      const { data, error } = await supabase!.rpc("admin_grant_gold", { p_email: grant.email, p_amount: amount, p_reason: grant.reason });
      if (error) return fail(error);
      toast({ ok: true, message: `Done. ${grant.email} now has ${Number(data).toLocaleString()} Gold.` });
      setGrant({ email: "", amount: "", reason: "" });
      void load();
    }, { yes: amount > 0 ? "Give Gold" : "Remove Gold", danger: amount < 0 });
  };

  return (
    <>
      <div className="grid sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Gold outstanding" value={sum ? sum.gold_outstanding.toLocaleString() : "—"} sub={sum ? `≈ $${Math.round(sum.gold_outstanding * USD_PER_GOLD).toLocaleString()} paid for, not yet spent` : undefined} />
        <Kpi label="Gold bought · 30d" value={sum ? sum.gold_bought_30d.toLocaleString() : "—"} />
        <Kpi label="Gold spent · 30d" value={sum ? sum.gold_spent_30d.toLocaleString() : "—"} />
        <Kpi label="Players holding Gold" value={sum ? sum.holders.toLocaleString() : "—"} />
      </div>

      <Section title="Drops" sub="Limited packs players buy with Gold Records. Each player can buy each drop once. Drops can contain stages, titles, badges, game cash, energy and bonus Gold, never reward points or raffle entries."
        right={<div className="flex flex-wrap gap-2 justify-end">
          {Object.keys(TEMPLATES).map((k) => <button key={k} className="btn btn-ghost text-xs" onClick={() => setForm(TEMPLATES[k]())}>+ {k}</button>)}
        </div>}>
        {!rows ? <p className="text-sm text-muted-fg">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">No drops yet. Start from a template above.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px] [&_th]:px-3 [&_td]:px-3">
              <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
                <tr className="border-b border-line"><th className="py-2">Drop</th><th className="text-right">Price</th><th>Runs</th><th className="text-right">Sold</th><th className="text-right">Gold in</th><th>Status</th><th /></tr>
              </thead>
              <tbody>{rows.map((d) => {
                const st = status(d);
                const s = sum?.sales[d.id];
                return (
                  <tr key={d.id} className="border-b border-line/50">
                    <td className="py-2"><span className="mr-2">{d.emoji}</span>{d.name}<span className="text-muted-fg text-xs"> · {d.kind}{d.new_players_days ? ` · first ${d.new_players_days}d` : ""}</span></td>
                    <td className="text-right tabular-nums">💿 {d.price_gold.toLocaleString()}</td>
                    <td className="text-xs text-muted-fg whitespace-nowrap">{when(d.starts_at)} → {d.ends_at ? when(d.ends_at) : "no end"}</td>
                    <td className="text-right tabular-nums">{s?.count ?? 0}</td>
                    <td className="text-right tabular-nums">{(s?.gold ?? 0).toLocaleString()}</td>
                    <td><span className={`text-[10px] px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span></td>
                    <td className="text-right whitespace-nowrap space-x-3">
                      <button className="text-xs underline" onClick={() => edit(d)}>Edit</button>
                      <button className="text-xs underline text-muted-fg" onClick={() => edit(d, true)}>Duplicate</button>
                      <button className="text-xs underline text-muted-fg" onClick={() => toggle(d)}>{d.active ? "Hide" : "Go live"}</button>
                      <button className="text-xs underline text-danger" onClick={() => remove(d)}>Delete</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      {form && <DropEditor form={form} setForm={setForm} save={save} busy={busy} />}

      <div className="grid lg:grid-cols-2 gap-5">
        <Section title="VIP Gold allowance" sub="Gold Records VIP members get with each monthly payment (12× up front for yearly).">
          <div className="flex gap-2 items-center">
            <input type="number" min={0} className={`${input} !w-32`} value={vipGold} onChange={(e) => setVipGold(e.target.value)} />
            <span className="text-xs text-muted-fg">Gold / month</span>
            <button className="btn btn-ghost text-sm" onClick={saveVipGold}>Save</button>
          </div>
        </Section>
        <Section title="Give or remove Gold" sub="For support: a refund, a make-good, or a giveaway winner. Logged on the player's Gold history.">
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <input className={input} placeholder="player@email.com" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} />
            <input type="number" className={input} placeholder="+100" value={grant.amount} onChange={(e) => setGrant({ ...grant, amount: e.target.value })} />
            <input className={`${input} col-span-2`} placeholder="Reason (e.g. missing pack after purchase)" value={grant.reason} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} />
          </div>
          <button className="btn btn-ghost text-sm mt-2" onClick={giveGold}>Apply</button>
        </Section>
      </div>
    </>
  );
}

function DropEditor({ form, setForm, save, busy }: { form: Form; setForm: (f: Form | null) => void; save: () => void; busy: boolean }) {
  const [add, setAdd] = useState<DropItem["type"]>("stage");
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setItem = (i: number, it: DropItem) => set({ items: form.items.map((x, j) => (j === i ? it : x)) });
  const blank = (t: DropItem["type"]): DropItem =>
    t === "stage" ? { type: "stage", id: STAGE_THEMES[1].id } : t === "title" ? { type: "title", name: "" } : t === "badge" ? { type: "badge", emoji: "⭐", name: "" }
    : t === "energy" ? { type: "energy", amount: 100 } : t === "gold" ? { type: "gold", amount: 50 } : { type: "cash", amount: 25000 };
  const gold = form.price_gold;

  return (
    <Section title={form.id ? "Edit drop" : "New drop"} right={<button className="text-xs underline text-muted-fg" onClick={() => setForm(null)}>Cancel</button>}>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="grid grid-cols-[4rem_1fr] gap-3">
            <label className="block text-xs text-muted-fg">Emoji<input className={`${input} mt-1 text-center`} maxLength={4} value={form.emoji} onChange={(e) => set({ emoji: e.target.value })} /></label>
            <label className="block text-xs text-muted-fg">Name<input className={`${input} mt-1`} maxLength={80} value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
          </div>
          <label className="block text-xs text-muted-fg">Description<textarea className={`${input} mt-1 h-20`} maxLength={600} value={form.description} onChange={(e) => set({ description: e.target.value })} /></label>
          <label className="block text-xs text-muted-fg">Banner image link (optional, https)<input className={`${input} mt-1`} value={form.image_url} onChange={(e) => set({ image_url: e.target.value })} placeholder="https://…" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted-fg">Type<select className={`${input} mt-1`} value={form.kind} onChange={(e) => set({ kind: e.target.value as Form["kind"] })}>
              <option value="bundle">Limited drop</option><option value="artist">Official artist pack</option><option value="starter">New player offer</option><option value="season">Season</option></select></label>
            <label className="block text-xs text-muted-fg">Unlocks at level<select className={`${input} mt-1`} value={form.min_level} onChange={(e) => set({ min_level: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((l) => <option key={l} value={l}>LV{l}</option>)}</select></label>
            <label className="block text-xs text-muted-fg">Price (Gold)<input type="number" min={0} className={`${input} mt-1`} value={form.price_gold} onChange={(e) => set({ price_gold: Number(e.target.value) })} />
              <span className="block mt-1">≈ ${(gold * USD_PER_GOLD).toFixed(2)}</span></label>
            <label className="block text-xs text-muted-fg">Was (Gold, optional strike-through)<input type="number" min={0} className={`${input} mt-1`} value={form.was_gold} onChange={(e) => set({ was_gold: e.target.value })} /></label>
            <label className="block text-xs text-muted-fg">Starts<input type="datetime-local" className={`${input} mt-1`} value={form.starts_at} onChange={(e) => set({ starts_at: e.target.value })} /></label>
            <label className="block text-xs text-muted-fg">Ends (blank = no end)<input type="datetime-local" className={`${input} mt-1`} value={form.ends_at} onChange={(e) => set({ ends_at: e.target.value })} /></label>
            <label className="block text-xs text-muted-fg">Only for accounts newer than (days)<input type="number" min={1} className={`${input} mt-1`} value={form.new_players_days} onChange={(e) => set({ new_players_days: e.target.value })} placeholder="blank = everyone" /></label>
            <label className="block text-xs text-muted-fg">Sort order<input type="number" className={`${input} mt-1`} value={form.sort} onChange={(e) => set({ sort: Number(e.target.value) })} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />Live (shows in the app between the start and end times)</label>
        </div>

        <div>
          <div className="text-xs text-muted-fg mb-2">What's inside</div>
          <ul className="space-y-2 mb-3">
            {form.items.map((it, i) => (
              <li key={i} className="panel p-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-muted-fg w-16">{it.type}</span>
                {it.type === "stage" && <>
                  <select className={`${input} !w-auto`} value={it.id} onChange={(e) => setItem(i, { ...it, id: e.target.value })}>{STAGE_THEMES.filter((t) => t.id !== "classic").map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}</select>
                  <input className={`${input} flex-1 min-w-[8rem]`} placeholder="Custom name (optional)" value={it.name ?? ""} onChange={(e) => setItem(i, { ...it, name: e.target.value || undefined })} />
                </>}
                {it.type === "title" && <input className={`${input} flex-1`} maxLength={32} placeholder="Opened for [Artist]" value={it.name} onChange={(e) => setItem(i, { ...it, name: e.target.value })} />}
                {it.type === "badge" && <>
                  <input className={`${input} !w-16 text-center`} maxLength={4} value={it.emoji} onChange={(e) => setItem(i, { ...it, emoji: e.target.value })} />
                  <input className={`${input} flex-1`} maxLength={32} placeholder="Badge name" value={it.name ?? ""} onChange={(e) => setItem(i, { ...it, name: e.target.value })} />
                </>}
                {(it.type === "cash" || it.type === "energy" || it.type === "gold") && (
                  <input type="number" min={1} className={`${input} !w-32`} value={it.amount} onChange={(e) => setItem(i, { ...it, amount: Math.max(1, Math.round(Number(e.target.value) || 0)) })} />
                )}
                <span className="text-xs text-muted-fg flex-1 min-w-[8rem]">{itemLabel(it)}</span>
                <button className="text-xs underline text-danger" onClick={() => set({ items: form.items.filter((_, j) => j !== i) })}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <select className={`${input} !w-auto`} value={add} onChange={(e) => setAdd(e.target.value as DropItem["type"])}>{ITEM_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</select>
            <button className="btn btn-ghost text-sm" onClick={() => set({ items: [...form.items, blank(add)] })}>+ Add item</button>
          </div>
          <p className="text-[11px] text-muted-fg mt-3">For an official artist pack you need the artist's written approval for their name, image and any music before it goes live.</p>
          <button className="btn btn-pink mt-5" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save drop"}</button>
        </div>
      </div>
    </Section>
  );
}
