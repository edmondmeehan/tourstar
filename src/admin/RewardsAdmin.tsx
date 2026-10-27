// Admin: rewards store items + redemptions, and raffles.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { LEVELS } from "../game/data";
import { toast, askConfirm } from "../components/ui";
import { Kpi, Section, fail, input, when } from "./kit";
import type { Raffle, RewardItem } from "../lib/rewards";

const levelOpts = LEVELS.map((l) => <option key={l.level} value={l.level}>LV{l.level} · {l.name}</option>);
const CATEGORIES = ["VIP", "Merch", "Records", "Tickets", "Experiences", "Digital"];

// ================================================================= rewards

type ItemForm = Omit<RewardItem, "id" | "options" | "stock" | "per_user_limit" | "image_url"> & {
  id?: string; options: string; stock: string; per_user_limit: string; image_url: string;
};
const blankItem: ItemForm = {
  name: "", description: "", emoji: "🎁", image_url: "", category: "Merch", cost_points: 500, min_level: 1,
  stock: "", per_user_limit: "1", needs_shipping: true, options: "", active: false, sort: 0,
};

interface RedemptionRow {
  id: string; created_at: string; status: string; item_name: string; option: string | null; cost_points: number; level_at: number;
  email: string | null; artist_name: string | null; ship_name: string | null; ship_address: string | null; ship_email: string | null; ship_phone: string | null; admin_note: string | null;
}
const R_STATUSES = ["pending", "approved", "shipped", "fulfilled", "rejected"] as const;
const R_LABEL: Record<string, string> = { pending: "Pending", approved: "Approved", shipped: "Shipped", fulfilled: "Delivered", rejected: "Rejected (refunded)" };

export function RewardsTab() {
  const [items, setItems] = useState<RewardItem[] | null>(null);
  const [form, setForm] = useState<ItemForm | null>(null);
  const [rows, setRows] = useState<RedemptionRow[] | null>(null);
  const [filter, setFilter] = useState<string>("pending");
  const [busy, setBusy] = useState(false);

  const loadItems = useCallback(async () => {
    const { data, error } = await supabase!.from("reward_items").select("*").order("sort").order("cost_points");
    if (error) return fail(error);
    setItems(data as RewardItem[]);
  }, []);
  const loadRows = useCallback(async () => {
    const { data, error } = await supabase!.rpc("admin_redemptions", { p_status: filter || null });
    if (error) return fail(error);
    setRows(data as RedemptionRow[]);
  }, [filter]);
  useEffect(() => { void loadItems(); }, [loadItems]);
  useEffect(() => { void loadRows(); }, [loadRows]);

  const edit = (i: RewardItem) => setForm({
    ...i, options: i.options.join(", "), stock: i.stock === null ? "" : String(i.stock),
    per_user_limit: i.per_user_limit === null ? "" : String(i.per_user_limit), image_url: i.image_url ?? "",
  });

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return toast({ ok: false, message: "Give the reward a name." });
    if (form.image_url && !form.image_url.startsWith("https://")) return toast({ ok: false, message: "Image links must start with https://" });
    const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))));
    const row = {
      name: form.name.trim(), description: form.description.trim(), emoji: form.emoji || "🎁", image_url: form.image_url.trim() || null,
      category: form.category, cost_points: Math.max(0, Math.round(form.cost_points)), min_level: form.min_level,
      stock: num(form.stock), per_user_limit: num(form.per_user_limit) || null, needs_shipping: form.needs_shipping,
      options: form.options.split(",").map((o) => o.trim()).filter(Boolean), active: form.active, sort: form.sort,
    };
    setBusy(true);
    const { error } = form.id ? await supabase!.from("reward_items").update(row).eq("id", form.id) : await supabase!.from("reward_items").insert(row);
    setBusy(false);
    if (error) return fail(error);
    toast({ ok: true, message: form.active ? "Saved. It's live in the store." : "Saved as hidden. Turn on \"Live\" when it's ready." });
    setForm(null);
    void loadItems();
  };

  const toggle = async (i: RewardItem) => {
    const { error } = await supabase!.from("reward_items").update({ active: !i.active }).eq("id", i.id);
    if (error) return fail(error);
    void loadItems();
  };
  const remove = (i: RewardItem) => askConfirm(`Delete "${i.name}"? Past orders keep their details.`, async () => {
    const { error } = await supabase!.from("reward_items").delete().eq("id", i.id);
    if (error) return fail(error);
    void loadItems();
  }, { yes: "Delete", danger: true });

  const setStatus = async (r: RedemptionRow, status: string) => {
    const go = async () => {
      const { error } = await supabase!.from("reward_redemptions").update({ status }).eq("id", r.id);
      if (error) return fail(error);
      void loadRows();
    };
    if (status === "rejected") askConfirm(`Reject ${r.artist_name ?? "this player"}'s ${r.item_name}? Their ${r.cost_points} points go back to them. Restock the item by hand if needed.`, go, { yes: "Reject", danger: true });
    else void go();
  };
  const note = async (r: RedemptionRow, admin_note: string) => {
    const { error } = await supabase!.from("reward_redemptions").update({ admin_note }).eq("id", r.id);
    if (error) fail(error);
  };

  const live = (items ?? []).filter((i) => i.active).length;
  const pending = filter === "pending" ? rows?.length ?? 0 : null;

  return (
    <>
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Kpi label="Live rewards" value={items ? live : "—"} sub={items ? `${items.length - live} hidden` : undefined} />
        <Kpi label="Waiting for review" value={pending ?? "—"} sub={pending === null ? "Filter by Pending to count" : undefined} />
        <Kpi label="How points work" value="Earned only" sub="Gigs, releases, daily rewards, level-ups. Tune the rate in Balance." />
      </div>

      <PointsReview />

      <Section title="Store items" sub="Real goods players redeem with points. Hidden items aren't shown in the app. Level gates use the highest level the player has reached."
        right={<button className="btn btn-pink text-sm" onClick={() => setForm({ ...blankItem })}>+ New reward</button>}>
        {!items ? <p className="text-sm text-muted-fg">Loading…</p> : items.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">No rewards yet. Add your first one.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px] [&_th]:px-3 [&_td]:px-3">
              <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left"><tr className="border-b border-line"><th className="py-2">Reward</th><th className="text-right">Points</th><th>Level</th><th className="text-right">Stock</th><th>Status</th><th /></tr></thead>
              <tbody>{items.map((i) => (
                <tr key={i.id} className="border-b border-line/50">
                  <td className="py-2"><span className="mr-2">{i.emoji}</span>{i.name}<span className="text-muted-fg text-xs"> · {i.category}{i.options.length ? ` · ${i.options.join("/")}` : ""}</span></td>
                  <td className="text-right tabular-nums">{i.cost_points.toLocaleString()}</td>
                  <td className="text-muted-fg">LV{i.min_level}</td>
                  <td className="text-right tabular-nums">{i.stock === null ? "∞" : i.stock}</td>
                  <td><span className={`text-[10px] px-2 py-0.5 rounded border ${i.active ? "text-success border-success" : "text-muted-fg border-line"}`}>{i.active ? "LIVE" : "HIDDEN"}</span></td>
                  <td className="text-right whitespace-nowrap space-x-3">
                    <button className="text-xs underline" onClick={() => edit(i)}>Edit</button>
                    <button className="text-xs underline text-muted-fg" onClick={() => toggle(i)}>{i.active ? "Hide" : "Go live"}</button>
                    <button className="text-xs underline text-danger" onClick={() => remove(i)}>Delete</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>

      {form && (
        <Section title={form.id ? "Edit reward" : "New reward"} right={<button className="text-xs underline text-muted-fg" onClick={() => setForm(null)}>Cancel</button>}>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="grid grid-cols-[4rem_1fr] gap-3">
                <label className="block text-xs text-muted-fg">Emoji<input className={`${input} mt-1 text-center`} maxLength={4} value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} /></label>
                <label className="block text-xs text-muted-fg">Name<input className={`${input} mt-1`} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Signed tour poster" /></label>
              </div>
              <label className="block text-xs text-muted-fg">Description<textarea className={`${input} mt-1 h-20`} maxLength={600} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="18×24, signed by the band." /></label>
              <label className="block text-xs text-muted-fg">Image link (optional, https)<input className={`${input} mt-1`} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" /></label>
              <label className="block text-xs text-muted-fg">Options players pick from (comma separated, optional)<input className={`${input} mt-1`} value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="S, M, L, XL" /></label>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-muted-fg">Points cost<input type="number" min={0} className={`${input} mt-1`} value={form.cost_points} onChange={(e) => setForm({ ...form, cost_points: Number(e.target.value) })} /></label>
                <label className="block text-xs text-muted-fg">Unlocks at<select className={`${input} mt-1`} value={form.min_level} onChange={(e) => setForm({ ...form, min_level: Number(e.target.value) })}>{levelOpts}</select></label>
                <label className="block text-xs text-muted-fg">Category<select className={`${input} mt-1`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="block text-xs text-muted-fg">Sort order<input type="number" className={`${input} mt-1`} value={form.sort} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} /></label>
                <label className="block text-xs text-muted-fg">Stock (blank = unlimited)<input type="number" min={0} className={`${input} mt-1`} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label>
                <label className="block text-xs text-muted-fg">Max per player (blank = no limit)<input type="number" min={1} className={`${input} mt-1`} value={form.per_user_limit} onChange={(e) => setForm({ ...form, per_user_limit: e.target.value })} /></label>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.needs_shipping} onChange={(e) => setForm({ ...form, needs_shipping: e.target.checked })} />Needs a shipping address</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Live in the store</label>
              <button className="btn btn-pink" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save reward"}</button>
            </div>
          </div>
        </Section>
      )}

      <Section title="Redemptions" sub="Review each order, then move it along as it ships. Rejecting refunds the player's points automatically."
        right={
          <select className={`${input} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>{R_STATUSES.map((s) => <option key={s} value={s}>{R_LABEL[s]}</option>)}
          </select>
        }>
        {!rows ? <p className="text-sm text-muted-fg">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">Nothing here.</p> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="py-3 grid md:grid-cols-[1fr_1fr_auto] gap-3 text-sm">
                <div>
                  <div className="font-semibold">{r.item_name}{r.option ? ` · ${r.option}` : ""}</div>
                  <div className="text-xs text-muted-fg">{r.cost_points.toLocaleString()} pts · LV{r.level_at} · {when(r.created_at)}</div>
                  <div className="text-xs mt-1">{r.artist_name ?? "—"} <span className="text-muted-fg">({r.email ?? "no email"})</span></div>
                </div>
                <div className="text-xs whitespace-pre-line">
                  {r.ship_name && <div className="font-semibold">{r.ship_name}</div>}
                  {r.ship_address && <div>{r.ship_address}</div>}
                  {r.ship_email && <div className="text-muted-fg">{r.ship_email}{r.ship_phone ? ` · ${r.ship_phone}` : ""}</div>}
                  <input className={`${input} mt-2 text-xs`} defaultValue={r.admin_note ?? ""} placeholder="Note / tracking number" onBlur={(e) => e.target.value !== (r.admin_note ?? "") && note(r, e.target.value)} />
                </div>
                <select className={`${input} w-auto h-fit`} value={r.status} onChange={(e) => setStatus(r, e.target.value)}>
                  {R_STATUSES.map((s) => <option key={s} value={s}>{R_LABEL[s]}</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

// ================================================================= points review (anti-cheat)

interface FlagRow { user_id: string; email: string | null; artist_name: string | null; raw_points: number; verified: number; withheld: number; adjust: number; spent: number; flagged_at: string; flag_reason: string | null; gigs: number; level: number }

function PointsReview() {
  const [rows, setRows] = useState<FlagRow[] | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase!.rpc("admin_flagged_players");
    if (error) return fail(error);
    setRows(data as FlagRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const resolve = (r: FlagRow, credit: boolean) => askConfirm(
    credit ? `Credit ${r.withheld.toLocaleString()} held points to ${r.artist_name ?? r.email}? Do this if the activity looks legitimate.` : `Clear the flag on ${r.artist_name ?? r.email} without crediting the held points?`,
    async () => {
      const { error } = await supabase!.rpc("admin_resolve_flag", { p_user: r.user_id, p_credit_withheld: credit });
      if (error) return fail(error);
      void load();
    }, { yes: credit ? "Credit points" : "Clear flag" });

  return (
    <Section title="Points review" sub="Points are earned on the device, so the server only credits what's realistic (500 an hour plus a 1,500 burst). Anything above that is held and the player shows up here. Players can only spend verified points.">
      {!rows ? <p className="text-sm text-muted-fg">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">Nothing flagged. 👍</p> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.user_id} className="py-3 flex flex-wrap items-start gap-3 text-sm">
              <div className="flex-1 min-w-[240px]">
                <div className="font-semibold">{r.artist_name ?? "—"} <span className="text-xs text-muted-fg font-normal">{r.email}</span></div>
                <div className="text-xs text-muted-fg mt-0.5">{r.flag_reason} · {when(r.flagged_at)}</div>
                <div className="text-xs mt-1">LV{r.level} · {r.gigs.toLocaleString()} gigs · device says {r.raw_points.toLocaleString()} pts · verified {(r.verified + r.adjust).toLocaleString()} · <b style={{ color: "var(--gold)" }}>{r.withheld.toLocaleString()} held</b> · spent {r.spent.toLocaleString()}</div>
              </div>
              <div className="flex gap-3 text-xs">
                <button className="underline" style={{ color: "var(--success)" }} onClick={() => resolve(r, true)}>Credit held points</button>
                <button className="underline text-muted-fg" onClick={() => resolve(r, false)}>Clear flag</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ================================================================= raffles

interface Summary { raffle_id: string; entrants: number; tickets: number; free_tickets: number; points_spent: number }
type RaffleForm = {
  id?: string; title: string; prize: string; description: string; emoji: string; image_url: string; prize_value_usd: string;
  ticket_cost: number; min_level: number; max_tickets_per_user: string; free_daily_entry: boolean; starts_at: string; ends_at: string; rules: string;
};
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
const DEFAULT_RULES =
  "Open to registered TourStar players who are legal residents of the 50 United States and D.C., 18 or older (or the age of majority where they live). " +
  "Void where prohibited. Enter with tickets bought with reward points earned in the game, or with one free entry per day. " +
  "Each ticket is one chance. One winner is drawn at random from all tickets after the raffle closes and is contacted by email; " +
  "if the winner doesn't reply within 7 days, an alternate is drawn. Prize is non-transferable. Odds depend on the number of tickets entered.";
const blankRaffle = (): RaffleForm => ({
  title: "", prize: "", description: "", emoji: "🎟️", image_url: "", prize_value_usd: "", ticket_cost: 100, min_level: 1,
  max_tickets_per_user: "50", free_daily_entry: true, starts_at: localInput(new Date()), ends_at: localInput(new Date(Date.now() + 14 * 864e5)), rules: DEFAULT_RULES,
});

export function RafflesTab() {
  const [list, setList] = useState<Raffle[] | null>(null);
  const [sum, setSum] = useState<Record<string, Summary>>({});
  const [form, setForm] = useState<RaffleForm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      supabase!.from("raffles").select("*").order("created_at", { ascending: false }),
      supabase!.rpc("admin_raffle_summary"),
    ]);
    if (r.error) return fail(r.error);
    setList(r.data as Raffle[]);
    if (!s.error) setSum(Object.fromEntries((s.data as Summary[]).map((x) => [x.raffle_id, x])));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const edit = (r: Raffle) => setForm({
    id: r.id, title: r.title, prize: r.prize, description: r.description, emoji: r.emoji, image_url: r.image_url ?? "",
    prize_value_usd: r.prize_value_usd === null ? "" : String(r.prize_value_usd), ticket_cost: r.ticket_cost, min_level: r.min_level,
    max_tickets_per_user: r.max_tickets_per_user === null ? "" : String(r.max_tickets_per_user), free_daily_entry: r.free_daily_entry,
    starts_at: localInput(new Date(r.starts_at)), ends_at: localInput(new Date(r.ends_at)), rules: r.rules,
  });

  const save = async (status?: Raffle["status"]) => {
    if (!form) return;
    if (!form.title.trim() || !form.prize.trim()) return toast({ ok: false, message: "Add a title and the prize." });
    if (new Date(form.ends_at) <= new Date(form.starts_at)) return toast({ ok: false, message: "End time must be after the start." });
    if (form.image_url && !form.image_url.startsWith("https://")) return toast({ ok: false, message: "Image links must start with https://" });
    const row: Record<string, unknown> = {
      title: form.title.trim(), prize: form.prize.trim(), description: form.description.trim(), emoji: form.emoji || "🎟️",
      image_url: form.image_url.trim() || null, prize_value_usd: form.prize_value_usd ? Math.round(Number(form.prize_value_usd)) : null,
      ticket_cost: Math.max(1, Math.round(form.ticket_cost)), min_level: form.min_level,
      max_tickets_per_user: form.max_tickets_per_user ? Math.max(1, Math.round(Number(form.max_tickets_per_user))) : null,
      free_daily_entry: form.free_daily_entry, starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString(), rules: form.rules.trim(),
    };
    if (status) row.status = status;
    setBusy(true);
    const { error } = form.id ? await supabase!.from("raffles").update(row).eq("id", form.id) : await supabase!.from("raffles").insert(row);
    setBusy(false);
    if (error) return fail(error);
    toast({ ok: true, message: status === "open" ? "Raffle is live. Players see it within minutes." : "Saved as a draft." });
    setForm(null);
    void load();
  };

  const setStatus = async (r: Raffle, status: Raffle["status"], extra: Record<string, unknown> = {}) => {
    const { error } = await supabase!.from("raffles").update({ status, ...extra }).eq("id", r.id);
    if (error) return fail(error);
    void load();
  };
  const closeNow = (r: Raffle) => askConfirm(`Close "${r.title}" now? No more entries. You can then draw a winner.`,
    () => void setStatus(r, "closed", { ends_at: new Date().toISOString() }), { yes: "Close raffle", danger: true });
  const draw = (r: Raffle) => askConfirm(`Draw the winner of "${r.title}"? This is final.`, async () => {
    const { data, error } = await supabase!.rpc("admin_draw_raffle", { p_raffle: r.id });
    if (error) return fail(error);
    const w = data as { email: string | null; artist: string | null; tickets_total: number };
    toast({ ok: true, message: `Winner: ${w.artist ?? "Player"} (${w.email ?? "no email"}) out of ${w.tickets_total.toLocaleString()} tickets. Email them to claim.` });
    void load();
  }, { yes: "Draw winner" });
  const remove = (r: Raffle) => askConfirm(`Delete "${r.title}" and all its entries? Points spent on it are refunded.`, async () => {
    const { error } = await supabase!.from("raffles").delete().eq("id", r.id);
    if (error) return fail(error);
    void load();
  }, { yes: "Delete", danger: true });

  const phase = (r: Raffle) => r.status === "open" && Date.parse(r.ends_at) <= Date.now() ? "ended" : r.status;
  const PHASE: Record<string, string> = { draft: "Draft", open: "Live", ended: "Ended · ready to draw", closed: "Closed · ready to draw", drawn: "Winner drawn" };

  return (
    <>
      <div className="panel p-4 mb-5 text-xs leading-relaxed" style={{ borderColor: "var(--gold)" }}>
        <b>Before you run a raffle for real prizes:</b> sweepstakes rules vary by state. Points here can't be bought and every raffle can offer a free daily entry,
        which keeps it a no-purchase-necessary sweepstakes, and the app shows that Apple isn't a sponsor (App Store rule 5.3).
        New York and Florida require registration and a bond when total prizes are over $5,000. Have a lawyer review the official rules before launch.
      </div>

      <Section title="Raffles" sub="Players spend points on tickets. Each ticket is one chance. Drafts are hidden from players."
        right={<button className="btn btn-pink text-sm" onClick={() => setForm(blankRaffle())}>+ New raffle</button>}>
        {!list ? <p className="text-sm text-muted-fg">Loading…</p> : list.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">No raffles yet.</p> : (
          <ul className="divide-y divide-line">
            {list.map((r) => {
              const s = sum[r.id];
              const p = phase(r);
              return (
                <li key={r.id} className="py-3 flex flex-wrap items-start gap-3">
                  <span className="text-2xl">{r.emoji}</span>
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-semibold text-sm">{r.title} <span className="text-xs text-muted-fg font-normal">· {r.prize}</span></div>
                    <div className="text-xs text-muted-fg mt-0.5">{when(r.starts_at)} → {when(r.ends_at)} · {r.ticket_cost} pts/ticket · LV{r.min_level}+{r.free_daily_entry ? " · free daily entry" : ""}</div>
                    <div className="text-xs mt-1">{s ? <>{Number(s.entrants).toLocaleString()} players · {Number(s.tickets).toLocaleString()} tickets ({Number(s.free_tickets ?? 0).toLocaleString()} free) · {Number(s.points_spent).toLocaleString()} pts spent</> : <span className="text-muted-fg">No entries yet</span>}</div>
                    {r.status === "drawn" && <div className="text-xs mt-1" style={{ color: "var(--gold)" }}>🏆 {r.winner_name} · drawn {when(r.drawn_at)}</div>}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${p === "open" ? "text-success border-success" : "text-muted-fg border-line"}`}>{PHASE[p].toUpperCase()}</span>
                  <div className="flex gap-3 text-xs">
                    {r.status !== "drawn" && <button className="underline" onClick={() => edit(r)}>Edit</button>}
                    {r.status === "draft" && <button className="underline" style={{ color: "var(--success)" }} onClick={() => setStatus(r, "open")}>Go live</button>}
                    {p === "open" && <button className="underline text-muted-fg" onClick={() => closeNow(r)}>Close now</button>}
                    {(p === "ended" || p === "closed") && <button className="underline" style={{ color: "var(--gold)" }} onClick={() => draw(r)}>Draw winner</button>}
                    {r.status !== "drawn" && <button className="underline text-danger" onClick={() => remove(r)}>Delete</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {form && (
        <Section title={form.id ? "Edit raffle" : "New raffle"} right={<button className="text-xs underline text-muted-fg" onClick={() => setForm(null)}>Cancel</button>}>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="grid grid-cols-[4rem_1fr] gap-3">
                <label className="block text-xs text-muted-fg">Emoji<input className={`${input} mt-1 text-center`} maxLength={4} value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} /></label>
                <label className="block text-xs text-muted-fg">Title<input className={`${input} mt-1`} maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="The Ultimate VIP Weekend" /></label>
              </div>
              <label className="block text-xs text-muted-fg">Prize<input className={`${input} mt-1`} maxLength={200} value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} placeholder="2 VIP tickets + meet & greet + hotel" /></label>
              <label className="block text-xs text-muted-fg">Description<textarea className={`${input} mt-1 h-20`} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <label className="block text-xs text-muted-fg">Image link (optional, https)<input className={`${input} mt-1`} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" /></label>
              <label className="block text-xs text-muted-fg">Official rules<textarea className={`${input} mt-1 h-40 text-xs`} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} /></label>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-muted-fg">Points per ticket<input type="number" min={1} className={`${input} mt-1`} value={form.ticket_cost} onChange={(e) => setForm({ ...form, ticket_cost: Number(e.target.value) })} /></label>
                <label className="block text-xs text-muted-fg">Open to<select className={`${input} mt-1`} value={form.min_level} onChange={(e) => setForm({ ...form, min_level: Number(e.target.value) })}>{levelOpts}</select></label>
                <label className="block text-xs text-muted-fg">Max tickets per player<input type="number" min={1} className={`${input} mt-1`} value={form.max_tickets_per_user} onChange={(e) => setForm({ ...form, max_tickets_per_user: e.target.value })} placeholder="No limit" /></label>
                <label className="block text-xs text-muted-fg">Prize value (USD)<input type="number" min={0} className={`${input} mt-1`} value={form.prize_value_usd} onChange={(e) => setForm({ ...form, prize_value_usd: e.target.value })} /></label>
                <label className="block text-xs text-muted-fg">Starts<input type="datetime-local" className={`${input} mt-1`} value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label>
                <label className="block text-xs text-muted-fg">Ends<input type="datetime-local" className={`${input} mt-1`} value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></label>
              </div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={form.free_daily_entry} onChange={(e) => setForm({ ...form, free_daily_entry: e.target.checked })} />
                <span>Free daily entry <span className="block text-xs text-muted-fg">Strongly recommended: a free way to enter keeps this a legal sweepstakes.</span></span></label>
              {Number(form.prize_value_usd) > 5000 && <p className="text-xs" style={{ color: "var(--gold)" }}>Prize over $5,000: New York and Florida registration and bonding apply.</p>}
              <div className="flex gap-2">
                <button className="btn btn-ghost" disabled={busy} onClick={() => save()}>Save draft</button>
                <button className="btn btn-pink" disabled={busy} onClick={() => save("open")}>{busy ? "Saving…" : "Save & go live"}</button>
              </div>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
