// Admin → Drops: create and schedule limited packs sold for Gold Records, see sales, manage Gold.
// Drops go live in the app at their start time with no app update.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { askConfirm, toast } from "../components/ui";
import { ITEM_TYPES, MOVES, SKIN_PRESETS, STAGE_THEMES, itemLabel, type DropItem, type MoveId } from "../game/cosmetics";
import type { Drop } from "../lib/gold";
import { Kpi, Section, fail, input, when } from "./kit";
import { USD_PER_GOLD, licenseState, type Partner } from "./partners";

type Row = Drop & { active: boolean; created_at: string; partner_id: string | null };
interface VenueOpt { id: string; name: string; emoji: string; pack_only: boolean }
interface Summary { gold_outstanding: number; gold_bought_30d: number; gold_spent_30d: number; holders: number; sales: Record<string, { count: number; gold: number }> }
type Form = Omit<Row, "id" | "created_at" | "was_gold" | "new_players_days" | "ends_at" | "image_url" | "partner_id"> & {
  id?: string; was_gold: string; new_players_days: string; ends_at: string; image_url: string; partner_id: string;
  perk?: PerkForm;
};
/** Real-world perks for a pack (stored apart from the pack so codes stay private until bought). */
interface PerkForm { merch_url: string; merch_label: string; discount_text: string; code_mode: "none" | "shared" | "unique"; shared_code: string; new_codes: string }
interface PerkRow { drop_id: string; merch_url: string | null; merch_label: string; discount_text: string; code_mode: PerkForm["code_mode"]; shared_code: string | null }
type PerkStats = Record<string, { codes: number; codes_left: number; revealed: number; taps: number }>;
const blankPerk = (): PerkForm => ({ merch_url: "", merch_label: "Official store", discount_text: "", code_mode: "none", shared_code: "", new_codes: "" });

const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
const inDays = (d: number) => local(new Date(Date.now() + d * 864e5).toISOString());

const TEMPLATES: Record<string, () => Form> = {
  "Starter pack": () => ({ name: "Starter Pack", emoji: "🚀", description: "A head start for new artists. One time only.", kind: "starter", price_gold: 100, was_gold: "400",
    items: [{ type: "stage", id: "neon-tokyo" }, { type: "cash", amount: 25000 }, { type: "energy", amount: 100 }, { type: "badge", emoji: "🚀", name: "Early Riser" }],
    starts_at: local(new Date().toISOString()), ends_at: "", new_players_days: "7", min_level: 1, active: false, sort: 0, image_url: "", partner_id: "" }),
  "Weekly bundle": () => ({ name: "Inferno Weekend", emoji: "🔥", description: "Turn the stage into a furnace. This weekend only.", kind: "bundle", price_gold: 300, was_gold: "",
    items: [{ type: "stage", id: "inferno" }, { type: "title", name: "Fire Starter" }, { type: "cash", amount: 50000 }],
    starts_at: local(new Date().toISOString()), ends_at: inDays(3), new_players_days: "", min_level: 1, active: false, sort: 0, image_url: "", partner_id: "" }),
  "Artist pack · major ($9.99)": () => ({ name: "[Artist] Official Tour Pack", emoji: "⭐", description: "The official [Artist] stage, title and badge. Limited to this tour event.", kind: "artist", price_gold: 1200, was_gold: "",
    items: [{ type: "stage", id: "royal-gold", name: "[Artist] Tour Stage" }, { type: "skin", name: "[Artist] Colors", a: "#F5F7FF", b: "#9FD8FF", bg: "#0E1220" },
      { type: "moves", id: "boyband", name: "[Artist] 8-Count", members: 5 }, { type: "title", name: "Opened for [Artist]" }, { type: "badge", emoji: "⭐", name: "[Artist] Crew" },
      { type: "perk", text: "15% off the official [Artist] store" }, { type: "perk", text: "Access to [Artist] presale codes" }],
    starts_at: local(new Date().toISOString()), ends_at: inDays(21), new_players_days: "", min_level: 1, active: false, sort: 0, image_url: "", partner_id: "" }),
  "Artist pack · emerging ($4.99)": () => ({ name: "[Artist] Official Tour Pack", emoji: "⭐", description: "The official [Artist] stage, title and badge. Limited to this tour event.", kind: "artist", price_gold: 500, was_gold: "",
    items: [{ type: "stage", id: "royal-gold", name: "[Artist] Tour Stage" }, { type: "skin", name: "[Artist] Colors", a: "#F5F7FF", b: "#9FD8FF", bg: "#0E1220" },
      { type: "moves", id: "boyband", name: "[Artist] 8-Count", members: 5 }, { type: "title", name: "Opened for [Artist]" }, { type: "badge", emoji: "⭐", name: "[Artist] Crew" },
      { type: "perk", text: "15% off the official [Artist] store" }, { type: "perk", text: "Access to [Artist] presale codes" }],
    starts_at: local(new Date().toISOString()), ends_at: inDays(21), new_players_days: "", min_level: 1, active: false, sort: 0, image_url: "", partner_id: "" }),
};

function status(d: Row, partner?: Partner, now = Date.now()) {
  const lic = licenseState(partner);
  if (d.partner_id && !lic.ok) return { label: lic.label, cls: lic.cls };
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
  const [partners, setPartners] = useState<Partner[]>([]);
  const [venues, setVenues] = useState<VenueOpt[]>([]);
  const [perks, setPerks] = useState<PerkRow[]>([]);
  const [perkStats, setPerkStats] = useState<PerkStats>({});

  const load = useCallback(async () => {
    const [d, s, c, p, v] = await Promise.all([
      supabase!.from("drops").select("*").order("starts_at", { ascending: false }),
      supabase!.rpc("admin_drops_summary"),
      supabase!.from("app_public_config").select("value").eq("key", "vip_monthly_gold").maybeSingle(),
      supabase!.from("partners").select("*").order("name"),
      supabase!.from("venues").select("id, name, emoji, pack_only").order("name"),
    ]);
    if (!p.error) setPartners(p.data as Partner[]);
    const [pp, ps] = await Promise.all([supabase!.from("pack_perks").select("*"), supabase!.rpc("admin_pack_perk_stats")]);
    if (!pp.error) setPerks(pp.data as PerkRow[]);
    if (!ps.error) setPerkStats(ps.data as PerkStats);
    if (!v.error) setVenues(v.data as VenueOpt[]);
    if (d.error) return fail(d.error);
    setRows(d.data as Row[]);
    if (!s.error) setSum(s.data as Summary);
    if (c.data?.value) setVipGold(String(c.data.value));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const edit = (d: Row, copy = false) => setForm({
    ...d, id: copy ? undefined : d.id, name: copy ? `${d.name} (copy)` : d.name, active: copy ? false : d.active,
    was_gold: d.was_gold === null ? "" : String(d.was_gold), new_players_days: d.new_players_days === null ? "" : String(d.new_players_days),
    starts_at: local(d.starts_at), ends_at: local(d.ends_at), image_url: d.image_url ?? "", partner_id: d.partner_id ?? "",
    perk: (() => {
      const r = perks.find((x) => x.drop_id === d.id);
      return r ? { merch_url: r.merch_url ?? "", merch_label: r.merch_label, discount_text: r.discount_text, code_mode: r.code_mode, shared_code: r.shared_code ?? "", new_codes: "" } : blankPerk();
    })(),
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
      new_players_days: n(form.new_players_days) || null, min_level: form.min_level, active: form.active, sort: form.sort, partner_id: form.partner_id || null,
    };
    if (form.items.some((i) => i.type === "venue" && !i.id)) return toast({ ok: false, message: "Pick the venue for each venue item." });
    if (form.items.some((i) => i.type === "perk" && !i.text.trim())) return toast({ ok: false, message: "Write the text for each perk line." });
    const perk = form.perk ?? blankPerk();
    if (perk.merch_url.trim() && !perk.merch_url.trim().startsWith("https://")) return toast({ ok: false, message: "The store link must start with https://" });
    if (perk.code_mode === "shared" && !perk.shared_code.trim()) return toast({ ok: false, message: "Enter the shared discount code, or choose no code." });
    const codes = [...new Set(perk.new_codes.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
    if (perk.code_mode === "unique" && !codes.length && !(form.id && perkStats[form.id]?.codes)) return toast({ ok: false, message: "Paste the unique discount codes (one per line), or switch to one shared code." });
    setBusy(true);
    const res = form.id ? await supabase!.from("drops").update(row).eq("id", form.id).select("id") : await supabase!.from("drops").insert(row).select("id");
    if (res.error) { setBusy(false); return fail(res.error); }
    const id = res.data?.[0]?.id as string;
    const hasPerk = !!perk.merch_url.trim() || perk.code_mode !== "none" || !!perk.discount_text.trim();
    const pr = hasPerk
      ? await supabase!.from("pack_perks").upsert({ drop_id: id, merch_url: perk.merch_url.trim() || null, merch_label: perk.merch_label.trim() || "Official store",
          discount_text: perk.discount_text.trim(), code_mode: perk.code_mode, shared_code: perk.code_mode === "shared" ? perk.shared_code.trim() : null, updated_at: new Date().toISOString() })
      : await supabase!.from("pack_perks").delete().eq("drop_id", id);
    if (pr.error) { setBusy(false); return fail(pr.error); }
    if (hasPerk && perk.code_mode === "unique" && codes.length) {
      for (let i = 0; i < codes.length; i += 500) {
        const { error } = await supabase!.from("pack_perk_codes").upsert(codes.slice(i, i + 500).map((code) => ({ drop_id: id, code })), { onConflict: "drop_id,code", ignoreDuplicates: true });
        if (error) { setBusy(false); return fail(error); }
      }
    }
    setBusy(false);
    const lic = licenseState(partners.find((x) => x.id === form.partner_id));
    toast({ ok: true, message: !lic.ok ? `Saved. Players won't see it until the partner's license is on file (${lic.label.toLowerCase()}).` : form.active ? "Saved. Players see it at its start time." : "Saved as hidden. Switch on \"Live\" when it's ready." });
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

      <Section title="Packs" sub="Limited packs players buy with Gold Records. Each player can buy each pack once. Packs can contain stages, titles, badges, venues, game cash, energy and bonus Gold, never reward points or raffle entries. Packs linked to a partner only show while that partner's license is signed and current (Partners & venues tab)."
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
                const partner = partners.find((x) => x.id === d.partner_id);
                const st = status(d, partner);
                const s = sum?.sales[d.id];
                return (
                  <tr key={d.id} className="border-b border-line/50">
                    <td className="py-2"><span className="mr-2">{d.emoji}</span>{d.name}<span className="text-muted-fg text-xs"> · {d.kind}{partner ? ` · ${partner.name}` : ""}{d.new_players_days ? ` · first ${d.new_players_days}d` : ""}</span></td>
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

      {form && <DropEditor form={form} setForm={setForm} save={save} busy={busy} partners={partners} venues={venues} perkStats={form.id ? perkStats[form.id] : undefined} />}

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

function DropEditor({ form, setForm, save, busy, partners, venues, perkStats }: { form: Form; setForm: (f: Form | null) => void; save: () => void; busy: boolean; partners: Partner[]; venues: VenueOpt[]; perkStats?: PerkStats[string] }) {
  const perk = form.perk ?? blankPerk();
  const setPerk = (patch: Partial<PerkForm>) => setForm({ ...form, perk: { ...perk, ...patch } });
  const [add, setAdd] = useState<DropItem["type"]>("stage");
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setItem = (i: number, it: DropItem) => set({ items: form.items.map((x, j) => (j === i ? it : x)) });
  const blank = (t: DropItem["type"]): DropItem =>
    t === "stage" ? { type: "stage", id: STAGE_THEMES[1].id } : t === "title" ? { type: "title", name: "" } : t === "badge" ? { type: "badge", emoji: "⭐", name: "" }
    : t === "energy" ? { type: "energy", amount: 100 } : t === "gold" ? { type: "gold", amount: 50 }
    : t === "venue" ? { type: "venue", id: venues[0]?.id ?? "", name: venues[0]?.name ?? "" }
    : t === "skin" ? { type: "skin", ...SKIN_PRESETS[0] } : t === "moves" ? { type: "moves", id: "boyband", members: 5 } : t === "perk" ? { type: "perk", text: "" }
    : { type: "cash", amount: 25000 };
  const partner = partners.find((x) => x.id === form.partner_id);
  const lic = licenseState(partner);
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
            <label className="block text-xs text-muted-fg col-span-2">Partner (artist, venue or brand whose name is on it)<select className={`${input} mt-1`} value={form.partner_id} onChange={(e) => set({ partner_id: e.target.value })}>
              <option value="">None (TourStar's own pack)</option>
              {partners.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.kind}</option>)}</select>
              {partner && <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded border ${lic.cls}`}>{lic.label}</span>}
              {partner && !lic.ok && <span className="block mt-1">Players won't see this pack until the license is signed and current.</span>}
              {!partners.length && <span className="block mt-1">Add partners in the Partners & venues tab.</span>}</label>
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
                {it.type === "venue" && (
                  <select className={`${input} !w-auto`} value={it.id} onChange={(e) => { const v = venues.find((x) => x.id === e.target.value); setItem(i, { type: "venue", id: e.target.value, name: v?.name ?? "" }); }}>
                    {!venues.length && <option value="">Add a venue first</option>}
                    {venues.map((v) => <option key={v.id} value={v.id}>{v.emoji} {v.name}{v.pack_only ? "" : " (open to all)"}</option>)}
                  </select>
                )}
                {it.type === "skin" && <>
                  <input className={`${input} flex-1 min-w-[8rem]`} maxLength={32} placeholder="Name, e.g. BSB White" value={it.name} onChange={(e) => setItem(i, { ...it, name: e.target.value })} />
                  <select className={`${input} !w-auto`} value="" onChange={(e) => { const p = SKIN_PRESETS[Number(e.target.value)]; if (p) setItem(i, { ...it, a: p.a, b: p.b, bg: p.bg }); }}>
                    <option value="">Presets…</option>{SKIN_PRESETS.map((p, j) => <option key={p.name} value={j}>{p.name}</option>)}
                  </select>
                  {(["a", "b", "bg"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1 text-[11px] text-muted-fg">{k === "a" ? "Main" : k === "b" ? "Second" : "Background"}
                      <input type="color" className="w-8 h-7 rounded bg-transparent" value={it[k]} onChange={(e) => setItem(i, { ...it, [k]: e.target.value.toUpperCase() })} /></label>
                  ))}
                </>}
                {it.type === "moves" && <>
                  <select className={`${input} !w-auto`} value={it.id} onChange={(e) => setItem(i, { ...it, id: e.target.value as MoveId })}>{MOVES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  <select className={`${input} !w-auto`} value={it.members ?? 1} onChange={(e) => setItem(i, { ...it, members: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? "Solo" : `${n} performers`}</option>)}</select>
                  <input className={`${input} flex-1 min-w-[8rem]`} maxLength={32} placeholder="Custom name (optional)" value={it.name ?? ""} onChange={(e) => setItem(i, { ...it, name: e.target.value || undefined })} />
                </>}
                {it.type === "perk" && <input className={`${input} flex-1`} maxLength={80} placeholder="15% off the official store" value={it.text} onChange={(e) => setItem(i, { ...it, text: e.target.value })} />}
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
          <div className="panel p-3 mt-5 space-y-2">
            <div className="text-sm font-semibold">Real-world perks for buyers</div>
            <p className="text-[11px] text-muted-fg">Shown only to players who own this pack, under Store → Drops → My pack perks. Add a matching "Perk line" item above so shoppers see it before buying. Presale access is set on the presale itself (Presales tab → "Also owners of").</p>
            <label className="block text-xs text-muted-fg">Merch store link (https)<input className={`${input} mt-1`} value={perk.merch_url} onChange={(e) => setPerk({ merch_url: e.target.value })} placeholder="https://shop.artist.com" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted-fg">Button text<input className={`${input} mt-1`} maxLength={60} value={perk.merch_label} onChange={(e) => setPerk({ merch_label: e.target.value })} /></label>
              <label className="block text-xs text-muted-fg">Discount (shown to owners)<input className={`${input} mt-1`} maxLength={80} value={perk.discount_text} onChange={(e) => setPerk({ discount_text: e.target.value })} placeholder="15% off everything" /></label>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["none", "shared", "unique"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2"><input type="radio" checked={perk.code_mode === m} onChange={() => setPerk({ code_mode: m })} />{m === "none" ? "No code" : m === "shared" ? "One shared code" : "Unique codes (one per buyer)"}</label>
              ))}
            </div>
            {perk.code_mode === "shared" && <input className={input} maxLength={80} placeholder="BSBTOURSTAR" value={perk.shared_code} onChange={(e) => setPerk({ shared_code: e.target.value })} />}
            {perk.code_mode === "unique" && <>
              <textarea className={`${input} h-24 font-mono text-xs`} placeholder="Paste single-use codes from the store, one per line" value={perk.new_codes} onChange={(e) => setPerk({ new_codes: e.target.value })} />
              {perkStats && <p className="text-[11px] text-muted-fg">{perkStats.codes_left.toLocaleString()} of {perkStats.codes.toLocaleString()} codes left · {perkStats.revealed.toLocaleString()} claimed · {perkStats.taps.toLocaleString()} store taps</p>}
            </>}
            {perk.code_mode !== "unique" && perkStats && <p className="text-[11px] text-muted-fg">{perkStats.revealed.toLocaleString()} codes revealed · {perkStats.taps.toLocaleString()} store taps</p>}
            <p className="text-[11px] text-muted-fg">Single-use codes can't be passed around online. The artist's store creates them (Shopify: Discounts → bulk codes).</p>
          </div>
          <p className="text-[11px] text-muted-fg mt-3">For an official artist pack you need the artist's written approval for their name, image, colors, any signature moves and any music before it goes live.</p>
          <button className="btn btn-pink mt-5" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save drop"}</button>
        </div>
      </div>
    </Section>
  );
}
