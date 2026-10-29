// Admin → Partners & venues: licensed artists/venues/brands, sponsored venues on the Tour page,
// and partner statements (pack sales, revenue share owed, venue views/plays/ticket taps).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/cloud";
import { askConfirm, toast } from "../components/ui";
import { TOURS } from "../game/data";
import { STAGE_THEMES } from "../game/cosmetics";
import type { Venue } from "../lib/venues";
import { Kpi, Section, fail, input, when } from "./kit";
import { AFTER_STORE_FEE, USD_PER_GOLD, licenseState, type Partner } from "./partners";
import { DrumCornerAdmin } from "./DrumCornerAdmin";

type VenueRow = Venue & { active: boolean; created_at: string };
interface Report {
  packs: { partner_id: string | null; drop_id: string; name: string; sold: number; gold: number }[];
  venues: { partner_id: string | null; venue_id: string; name: string; views: number; plays: number; tickets: number }[];
  merch?: { partner_id: string | null; drop_id: string; name: string; taps: number; codes: number }[];
}

const BASE_TOURS = TOURS.filter((t) => t.id !== "open-mic");
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + "01";
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");

const blankPartner = (): Omit<Partner, "id" | "created_at"> & { id?: string } => ({
  name: "", kind: "artist", contact_name: "", contact_email: "", rev_share_pct: 30, flat_fee_usd: 0,
  license_signed_on: null, license_expires_on: null, approved_assets: "Name, logo, approved photos", notes: "", active: true,
});
type PartnerForm = ReturnType<typeof blankPartner>;

type VenueForm = Omit<VenueRow, "id" | "created_at" | "capacity" | "ends_at" | "image_url" | "ticket_url" | "partner_id" | "stage_theme"> & {
  id?: string; capacity: string; ends_at: string; image_url: string; ticket_url: string; partner_id: string; stage_theme: string;
};
const blankVenue = (): VenueForm => ({
  name: "", city: "", emoji: "🏟️", tagline: "", image_url: "", base_tour: "theater-tour", capacity: "", stage_theme: "",
  fame_bonus_pct: 10, ticket_url: "", ticket_label: "See real upcoming shows", pack_only: false, sponsored: true,
  starts_at: local(new Date().toISOString()), ends_at: "", active: false, sort: 0, partner_id: "",
});

export function PartnersTab() {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [venues, setVenues] = useState<VenueRow[] | null>(null);
  const [packs, setPacks] = useState<{ id: string; name: string; partner_id: string | null }[]>([]);
  const [pForm, setPForm] = useState<PartnerForm | null>(null);
  const [vForm, setVForm] = useState<VenueForm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, v, d] = await Promise.all([
      supabase!.from("partners").select("*").order("name"),
      supabase!.from("venues").select("*").order("sort").order("name"),
      supabase!.from("drops").select("id, name, partner_id"),
    ]);
    if (p.error) return fail(p.error.message.includes("partners") ? { message: "Run RUN-IN-SUPABASE-PARTNERS.sql in Supabase to turn on partners and venues." } : p.error);
    setPartners(p.data as Partner[]);
    if (!v.error) setVenues(v.data as VenueRow[]);
    if (!d.error) setPacks(d.data as typeof packs);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // ---------------------------------------------------------------- partners
  const savePartner = async () => {
    if (!pForm) return;
    if (!pForm.name.trim()) return toast({ ok: false, message: "Give the partner a name." });
    if (pForm.license_signed_on && pForm.license_expires_on && pForm.license_expires_on < pForm.license_signed_on) return toast({ ok: false, message: "The license can't expire before it was signed." });
    const { id, ...row } = { ...pForm, name: pForm.name.trim(), contact_email: pForm.contact_email.trim(),
      rev_share_pct: Math.max(0, Math.min(100, Number(pForm.rev_share_pct) || 0)), flat_fee_usd: Math.max(0, Number(pForm.flat_fee_usd) || 0),
      license_signed_on: pForm.license_signed_on || null, license_expires_on: pForm.license_expires_on || null };
    setBusy(true);
    const { error } = id ? await supabase!.from("partners").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id) : await supabase!.from("partners").insert(row);
    setBusy(false);
    if (error) return fail(error);
    toast({ ok: true, message: row.license_signed_on ? "Partner saved." : "Saved. Their packs and venues stay hidden until you add the license signed date." });
    setPForm(null);
    void load();
  };

  const removePartner = (p: Partner) => askConfirm(`Delete partner "${p.name}"? Their packs and venues stay but are no longer linked to anyone, so they'd show without a license check. Usually it's better to pause the partner instead. This can't be undone.`, async () => {
    const { error } = await supabase!.from("partners").delete().eq("id", p.id);
    if (error) return fail(error);
    void load();
  }, { yes: "Delete", danger: true });

  // ---------------------------------------------------------------- venues
  const editVenue = (v: VenueRow) => setVForm({
    ...v, capacity: v.capacity ? String(v.capacity) : "", ends_at: local(v.ends_at), starts_at: local(v.starts_at), image_url: v.image_url ?? "",
    ticket_url: v.ticket_url ?? "", partner_id: v.partner_id ?? "", stage_theme: v.stage_theme ?? "",
  });

  const saveVenue = async () => {
    if (!vForm) return;
    if (!vForm.name.trim()) return toast({ ok: false, message: "Give the venue a name." });
    for (const [label, url] of [["Ticket link", vForm.ticket_url], ["Image link", vForm.image_url]] as const) {
      if (url.trim() && !url.trim().startsWith("https://")) return toast({ ok: false, message: `${label} must start with https://` });
    }
    const cap = vForm.capacity.trim() ? Math.round(Number(vForm.capacity)) : null;
    if (cap !== null && (!Number.isFinite(cap) || cap < 50 || cap > 200000)) return toast({ ok: false, message: "Capacity must be between 50 and 200,000 (or blank)." });
    const row = {
      name: vForm.name.trim(), city: vForm.city.trim(), emoji: vForm.emoji || "🏟️", tagline: vForm.tagline.trim(), image_url: vForm.image_url.trim() || null,
      base_tour: vForm.base_tour, capacity: cap, stage_theme: vForm.stage_theme || null, fame_bonus_pct: Math.max(0, Math.min(50, Math.round(vForm.fame_bonus_pct))),
      ticket_url: vForm.ticket_url.trim() || null, ticket_label: vForm.ticket_label.trim() || "See real upcoming shows",
      pack_only: vForm.pack_only, sponsored: vForm.sponsored, starts_at: new Date(vForm.starts_at || Date.now()).toISOString(),
      ends_at: vForm.ends_at ? new Date(vForm.ends_at).toISOString() : null, active: vForm.active, sort: vForm.sort, partner_id: vForm.partner_id || null,
      updated_at: new Date().toISOString(),
    };
    setBusy(true);
    const { error } = vForm.id ? await supabase!.from("venues").update(row).eq("id", vForm.id) : await supabase!.from("venues").insert(row);
    setBusy(false);
    if (error) return fail(error);
    const lic = licenseState(partners?.find((x) => x.id === row.partner_id));
    toast({ ok: true, message: !lic.ok ? `Saved. Players won't see it until the partner's license is on file (${lic.label.toLowerCase()}).` : row.active ? "Saved. It shows on the Tour page from its start time." : "Saved as hidden. Switch on \"Live\" when it's ready." });
    setVForm(null);
    void load();
  };

  const toggleVenue = (v: VenueRow) => askConfirm(v.active ? `Hide "${v.name}" from the Tour page?` : `Make "${v.name}" live on the Tour page?`, async () => {
    const { error } = await supabase!.from("venues").update({ active: !v.active, updated_at: new Date().toISOString() }).eq("id", v.id);
    if (error) return fail(error);
    void load();
  }, { yes: v.active ? "Hide" : "Go live" });

  const removeVenue = (v: VenueRow) => askConfirm(`Delete "${v.name}"? Its view/play/ticket history is deleted too, and packs that included it will show a venue that no longer exists. Hiding it keeps the history. This can't be undone.`, async () => {
    const { error } = await supabase!.from("venues").delete().eq("id", v.id);
    if (error) return fail(error);
    void load();
  }, { yes: "Delete", danger: true });

  const venueStatus = (v: VenueRow) => {
    const lic = licenseState(partners?.find((x) => x.id === v.partner_id));
    if (v.partner_id && !lic.ok) return { label: lic.label, cls: lic.cls };
    if (!v.active) return { label: "HIDDEN", cls: "text-muted-fg border-line" };
    if (Date.parse(v.starts_at) > Date.now()) return { label: "SCHEDULED", cls: "text-electric border-electric" };
    if (v.ends_at && Date.parse(v.ends_at) <= Date.now()) return { label: "ENDED", cls: "text-muted-fg border-line" };
    return { label: "LIVE", cls: "text-success border-success" };
  };

  const expiring = (partners ?? []).filter((p) => p.active && licenseState(p).label.startsWith("EXPIRES")).length;
  const unlicensed = (partners ?? []).filter((p) => p.active && !licenseState(p).ok).length;

  return (
    <>
      <div className="grid sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Partners" value={partners?.length ?? "—"} />
        <Kpi label="Licenses expiring ≤30d" value={partners ? expiring : "—"} />
        <Kpi label="Missing / expired license" value={partners ? unlicensed : "—"} sub="Their packs & venues are hidden" />
        <Kpi label="Live venues" value={venues ? venues.filter((v) => venueStatus(v).label === "LIVE").length : "—"} />
      </div>

      <Section title="Partners" sub="Artists, venues and brands whose real names appear in the game. Their packs and venues only show to players while the license is signed and not expired; on the expiry date they disappear automatically. Players keep what they already bought."
        right={<button className="btn btn-ghost text-xs" onClick={() => setPForm(blankPartner())}>+ Partner</button>}>
        {!partners ? <p className="text-sm text-muted-fg">Loading…</p> : partners.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">No partners yet. Add the first artist or venue you have permission from.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px] [&_th]:px-3 [&_td]:px-3">
              <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
                <tr className="border-b border-line"><th className="py-2">Partner</th><th>Deal</th><th>License</th><th>Contact</th><th className="text-right">Packs</th><th className="text-right">Venues</th><th /></tr>
              </thead>
              <tbody>{partners.map((p) => {
                const lic = licenseState(p);
                return (
                  <tr key={p.id} className="border-b border-line/50">
                    <td className="py-2">{p.name}<span className="text-muted-fg text-xs"> · {p.kind}</span></td>
                    <td className="text-xs">{p.rev_share_pct > 0 && `${p.rev_share_pct}% rev share`}{p.rev_share_pct > 0 && p.flat_fee_usd > 0 && " · "}{p.flat_fee_usd > 0 && `pays ${money(p.flat_fee_usd)}`}{!p.rev_share_pct && !p.flat_fee_usd && <span className="text-muted-fg">—</span>}</td>
                    <td className="whitespace-nowrap"><span className={`text-[10px] px-2 py-0.5 rounded border ${lic.cls}`}>{lic.label}</span>
                      {p.license_expires_on && <span className="text-[11px] text-muted-fg ml-2">to {p.license_expires_on}</span>}</td>
                    <td className="text-xs text-muted-fg">{p.contact_name}{p.contact_email && <> · <a className="underline" href={`mailto:${p.contact_email}`}>{p.contact_email}</a></>}</td>
                    <td className="text-right tabular-nums">{packs.filter((d) => d.partner_id === p.id).length}</td>
                    <td className="text-right tabular-nums">{(venues ?? []).filter((v) => v.partner_id === p.id).length}</td>
                    <td className="text-right whitespace-nowrap space-x-3">
                      <button className="text-xs underline" onClick={() => setPForm({ ...p })}>Edit</button>
                      <button className="text-xs underline text-danger" onClick={() => removePartner(p)}>Delete</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      {pForm && <PartnerEditor form={pForm} set={setPForm} save={savePartner} busy={busy} />}

      <Section title="Featured venues" sub="Real venues players can book on the Tour page. Each one plays like a base tour (same energy, cost and pay) with its real capacity, its own stage look and a fame bonus, and can link to the venue's real upcoming shows. Pack-only venues unlock when a player buys a pack that includes them (add a Venue item in Packs & Gold)."
        right={<button className="btn btn-ghost text-xs" onClick={() => setVForm(blankVenue())}>+ Venue</button>}>
        {!venues ? <p className="text-sm text-muted-fg">Loading…</p> : venues.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">No venues yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px] [&_th]:px-3 [&_td]:px-3">
              <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
                <tr className="border-b border-line"><th className="py-2">Venue</th><th>Plays like</th><th>Partner</th><th>Runs</th><th>Status</th><th /></tr>
              </thead>
              <tbody>{venues.map((v) => {
                const st = venueStatus(v);
                const t = TOURS.find((x) => x.id === v.base_tour);
                return (
                  <tr key={v.id} className="border-b border-line/50">
                    <td className="py-2"><span className="mr-2">{v.emoji}</span>{v.name}<span className="text-muted-fg text-xs">{v.city && ` · ${v.city}`}{v.pack_only && " · pack only"}</span></td>
                    <td className="text-xs">{t?.name} (LV{t?.level}){v.fame_bonus_pct > 0 && ` · +${v.fame_bonus_pct}% fame`}</td>
                    <td className="text-xs">{partners?.find((p) => p.id === v.partner_id)?.name ?? <span className="text-muted-fg">—</span>}</td>
                    <td className="text-xs text-muted-fg whitespace-nowrap">{when(v.starts_at)} → {v.ends_at ? when(v.ends_at) : "no end"}</td>
                    <td><span className={`text-[10px] px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span></td>
                    <td className="text-right whitespace-nowrap space-x-3">
                      <button className="text-xs underline" onClick={() => editVenue(v)}>Edit</button>
                      <button className="text-xs underline text-muted-fg" onClick={() => toggleVenue(v)}>{v.active ? "Hide" : "Go live"}</button>
                      <button className="text-xs underline text-danger" onClick={() => removeVenue(v)}>Delete</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      {vForm && <VenueEditor form={vForm} set={setVForm} save={saveVenue} busy={busy} partners={partners ?? []} />}

      <DrumCornerAdmin partners={partners} />

      <Statements partners={partners ?? []} />
    </>
  );
}

function PartnerEditor({ form, set, save, busy }: { form: PartnerForm; set: (f: PartnerForm | null) => void; save: () => void; busy: boolean }) {
  const up = (patch: Partial<PartnerForm>) => set({ ...form, ...patch });
  const lic = licenseState({ ...form, id: "x", created_at: "" } as Partner);
  return (
    <Section title={form.id ? `Edit ${form.name}` : "New partner"} right={<button className="text-xs underline text-muted-fg" onClick={() => set(null)}>Cancel</button>}>
      <div className="grid md:grid-cols-3 gap-3">
        <label className="block text-xs text-muted-fg md:col-span-2">Name (exactly as licensed)<input className={`${input} mt-1`} maxLength={80} value={form.name} onChange={(e) => up({ name: e.target.value })} placeholder="Backstreet Boys" /></label>
        <label className="block text-xs text-muted-fg">Type<select className={`${input} mt-1`} value={form.kind} onChange={(e) => up({ kind: e.target.value as Partner["kind"] })}>
          <option value="artist">Artist</option><option value="venue">Venue</option><option value="brand">Brand / sponsor</option></select></label>
        <label className="block text-xs text-muted-fg">Contact name<input className={`${input} mt-1`} maxLength={80} value={form.contact_name} onChange={(e) => up({ contact_name: e.target.value })} placeholder="Manager or venue marketing" /></label>
        <label className="block text-xs text-muted-fg">Contact email<input type="email" className={`${input} mt-1`} maxLength={120} value={form.contact_email} onChange={(e) => up({ contact_email: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm mt-5"><input type="checkbox" checked={form.active} onChange={(e) => up({ active: e.target.checked })} />Active (uncheck to pause everything with their name)</label>
        <label className="block text-xs text-muted-fg">Revenue share we pay them (%)<input type="number" min={0} max={100} step={0.5} className={`${input} mt-1`} value={form.rev_share_pct} onChange={(e) => up({ rev_share_pct: Number(e.target.value) })} />
          <span className="block mt-1">Of pack sales after the app store fee.</span></label>
        <label className="block text-xs text-muted-fg">Flat fee they pay us ($ per term)<input type="number" min={0} step={100} className={`${input} mt-1`} value={form.flat_fee_usd} onChange={(e) => up({ flat_fee_usd: Number(e.target.value) })} />
          <span className="block mt-1">For sponsored venues and brands.</span></label>
        <div />
        <label className="block text-xs text-muted-fg">License signed on<input type="date" className={`${input} mt-1`} value={form.license_signed_on ?? ""} onChange={(e) => up({ license_signed_on: e.target.value || null })} /></label>
        <label className="block text-xs text-muted-fg">License expires on (blank = no end date)<input type="date" className={`${input} mt-1`} value={form.license_expires_on ?? ""} onChange={(e) => up({ license_expires_on: e.target.value || null })} /></label>
        <div className="text-xs text-muted-fg mt-5">{lic.label && <span className={`text-[10px] px-2 py-0.5 rounded border ${lic.cls}`}>{lic.label}</span>}</div>
        <label className="block text-xs text-muted-fg md:col-span-3">Approved assets (what the license lets you use)<input className={`${input} mt-1`} maxLength={600} value={form.approved_assets} onChange={(e) => up({ approved_assets: e.target.value })} placeholder="Name, logo, 3 approved photos, voice lines recorded by the artist. No music." /></label>
        <label className="block text-xs text-muted-fg md:col-span-3">Notes (where the signed license is filed, approvals, contacts)<textarea className={`${input} mt-1 h-20`} maxLength={2000} value={form.notes} onChange={(e) => up({ notes: e.target.value })} /></label>
      </div>
      <p className="text-[11px] text-muted-fg mt-3">Keep the signed license on file: Apple can ask for proof of permission to use a real name (App Review guideline 5.2).</p>
      <button className="btn btn-pink mt-4" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save partner"}</button>
    </Section>
  );
}

function VenueEditor({ form, set, save, busy, partners }: { form: VenueForm; set: (f: VenueForm | null) => void; save: () => void; busy: boolean; partners: Partner[] }) {
  const up = (patch: Partial<VenueForm>) => set({ ...form, ...patch });
  const t = TOURS.find((x) => x.id === form.base_tour);
  const partner = partners.find((p) => p.id === form.partner_id);
  const lic = licenseState(partner);
  return (
    <Section title={form.id ? `Edit ${form.name}` : "New venue"} right={<button className="text-xs underline text-muted-fg" onClick={() => set(null)}>Cancel</button>}>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="grid grid-cols-[4rem_1fr] gap-3 md:col-span-2">
          <label className="block text-xs text-muted-fg">Emoji<input className={`${input} mt-1 text-center`} maxLength={4} value={form.emoji} onChange={(e) => up({ emoji: e.target.value })} /></label>
          <label className="block text-xs text-muted-fg">Venue name<input className={`${input} mt-1`} maxLength={80} value={form.name} onChange={(e) => up({ name: e.target.value })} placeholder="The Ryman" /></label>
        </div>
        <label className="block text-xs text-muted-fg">City<input className={`${input} mt-1`} maxLength={80} value={form.city} onChange={(e) => up({ city: e.target.value })} placeholder="Nashville, TN" /></label>
        <label className="block text-xs text-muted-fg md:col-span-3">Tagline<input className={`${input} mt-1`} maxLength={200} value={form.tagline} onChange={(e) => up({ tagline: e.target.value })} placeholder="The Mother Church of Country Music." /></label>
        <label className="block text-xs text-muted-fg">Partner (licensor)<select className={`${input} mt-1`} value={form.partner_id} onChange={(e) => up({ partner_id: e.target.value })}>
          <option value="">None</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.kind}</option>)}</select>
          {partner ? <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded border ${lic.cls}`}>{lic.label}</span>
            : <span className="block mt-1">Link the venue (or its sponsor) so it hides if the license lapses.</span>}</label>
        <label className="block text-xs text-muted-fg">Plays like<select className={`${input} mt-1`} value={form.base_tour} onChange={(e) => up({ base_tour: e.target.value })}>
          {BASE_TOURS.map((x) => <option key={x.id} value={x.id}>{x.name} · LV{x.level} · ⚡{x.energy}</option>)}</select>
          <span className="block mt-1">Unlocks at level {t?.level}. Same energy, cost and pay.</span></label>
        <label className="block text-xs text-muted-fg">Real capacity (blank = {t?.capacity.toLocaleString()})<input type="number" min={50} max={200000} className={`${input} mt-1`} value={form.capacity} onChange={(e) => up({ capacity: e.target.value })} /></label>
        <label className="block text-xs text-muted-fg">Fame bonus (%)<input type="number" min={0} max={50} className={`${input} mt-1`} value={form.fame_bonus_pct} onChange={(e) => up({ fame_bonus_pct: Number(e.target.value) })} />
          <span className="block mt-1">Reason to play here. 10–15% is plenty.</span></label>
        <label className="block text-xs text-muted-fg">Stage look<select className={`${input} mt-1`} value={form.stage_theme} onChange={(e) => up({ stage_theme: e.target.value })}>
          <option value="">Player's own stage</option>{STAGE_THEMES.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}</select></label>
        <label className="block text-xs text-muted-fg">Banner image link (optional, https)<input className={`${input} mt-1`} value={form.image_url} onChange={(e) => up({ image_url: e.target.value })} placeholder="https://…" /></label>
        <label className="block text-xs text-muted-fg md:col-span-2">Real tickets link (https; taps are counted)<input className={`${input} mt-1`} value={form.ticket_url} onChange={(e) => up({ ticket_url: e.target.value })} placeholder="https://www.ryman.com/events" /></label>
        <label className="block text-xs text-muted-fg">Ticket button text<input className={`${input} mt-1`} maxLength={40} value={form.ticket_label} onChange={(e) => up({ ticket_label: e.target.value })} /></label>
        <label className="block text-xs text-muted-fg">Starts<input type="datetime-local" className={`${input} mt-1`} value={form.starts_at} onChange={(e) => up({ starts_at: e.target.value })} /></label>
        <label className="block text-xs text-muted-fg">Ends (blank = no end)<input type="datetime-local" className={`${input} mt-1`} value={form.ends_at} onChange={(e) => up({ ends_at: e.target.value })} /></label>
        <label className="block text-xs text-muted-fg">Sort order<input type="number" className={`${input} mt-1`} value={form.sort} onChange={(e) => up({ sort: Number(e.target.value) })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.sponsored} onChange={(e) => up({ sponsored: e.target.checked })} />Show "Featured" tag</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pack_only} onChange={(e) => up({ pack_only: e.target.checked })} />Pack only (unlocked by buying a pack)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => up({ active: e.target.checked })} />Live</label>
      </div>
      <button className="btn btn-pink mt-4" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save venue"}</button>
    </Section>
  );
}

function Statements({ partners }: { partners: Partner[] }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase!.rpc("admin_partner_report", { p_from: from, p_to: to });
    setLoading(false);
    if (error) return fail(error);
    setRep(data as Report);
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    if (!rep) return [];
    return partners.map((p) => {
      const pk = rep.packs.filter((x) => x.partner_id === p.id);
      const vn = rep.venues.filter((x) => x.partner_id === p.id);
      const mc = (rep.merch ?? []).filter((x) => x.partner_id === p.id);
      const gold = pk.reduce((a, x) => a + x.gold, 0);
      const gross = gold * USD_PER_GOLD;
      const net = gross * AFTER_STORE_FEE;
      return {
        p, pk, vn, sold: pk.reduce((a, x) => a + x.sold, 0), gold, gross, net, owed: net * (p.rev_share_pct / 100),
        views: vn.reduce((a, x) => a + x.views, 0), plays: vn.reduce((a, x) => a + x.plays, 0), tickets: vn.reduce((a, x) => a + x.tickets, 0),
        storeTaps: mc.reduce((a, x) => a + x.taps, 0), codes: mc.reduce((a, x) => a + x.codes, 0),
      };
    }).filter((r) => r.sold || r.views || r.plays || r.tickets || r.storeTaps || r.codes || r.pk.length || r.vn.length);
  }, [rep, partners]);

  const csv = () => {
    const head = ["Partner", "Type", "Packs sold", "Gold spent", "Est. gross $", "Est. net after store fee $", "Rev share %", "Owed to partner $", "Venue views", "Venue plays", "Ticket taps", "Merch store taps", "Discount codes claimed", "Flat fee they pay $"];
    const lines = rows.map((r) => [r.p.name, r.p.kind, r.sold, r.gold, r.gross.toFixed(2), r.net.toFixed(2), r.p.rev_share_pct, r.owed.toFixed(2), r.views, r.plays, r.tickets, r.storeTaps, r.codes, r.p.flat_fee_usd.toFixed(2)]);
    const text = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `tourstar-partners-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copy = async (r: (typeof rows)[number]) => {
    const lines = [
      `TourStar partner statement: ${r.p.name}`, `Period: ${from} to ${to}`, "",
      ...(r.pk.length ? ["Packs", ...r.pk.map((x) => `  ${x.name}: ${x.sold} sold, ${x.gold.toLocaleString()} Gold`),
        `  Estimated net sales (after app store fee): ${money(r.net)}`, `  Revenue share (${r.p.rev_share_pct}%): ${money(r.owed)}`, ""] : []),
      ...(r.storeTaps || r.codes ? ["Merch", `  ${r.codes.toLocaleString()} discount codes claimed, ${r.storeTaps.toLocaleString()} taps to your store`, ""] : []),
      ...(r.vn.length ? ["Featured venues", ...r.vn.map((x) => `  ${x.name}: ${x.views.toLocaleString()} players saw it, ${x.plays.toLocaleString()} shows played, ${x.tickets.toLocaleString()} ticket-link taps`), ""] : []),
      "Figures are estimates from in-game Gold spend; final amounts follow the app store payout report.",
    ];
    try { await navigator.clipboard.writeText(lines.join("\n")); toast({ ok: true, message: "Statement copied. Paste it into an email." }); }
    catch { toast({ ok: false, message: "Couldn't copy. Use the CSV instead." }); }
  };

  const totalOwed = rows.reduce((a, r) => a + r.owed, 0);
  return (
    <Section title="Partner statements" sub="Pack sales and venue traffic per partner for any period. Dollar amounts are estimates (Gold × $9.99/1,200, less the 15% store fee); reconcile with the App Store and Google Play payout reports before paying."
      right={<div className="flex flex-wrap gap-2 items-center justify-end">
        <input type="date" className={`${input} !w-auto`} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-xs text-muted-fg">to</span>
        <input type="date" className={`${input} !w-auto`} value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn btn-ghost text-xs" disabled={!rows.length} onClick={csv}>Download CSV</button>
      </div>}>
      {loading && !rep ? <p className="text-sm text-muted-fg">Loading…</p> : !rows.length ? <p className="text-sm text-muted-fg text-center py-6">No partner sales or venue traffic in this period.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px] [&_th]:px-3 [&_td]:px-3">
            <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
              <tr className="border-b border-line"><th className="py-2">Partner</th><th className="text-right">Packs sold</th><th className="text-right">Gold</th><th className="text-right">Est. net $</th><th className="text-right">Owed to them</th><th className="text-right">Views</th><th className="text-right">Plays</th><th className="text-right">Ticket taps</th><th className="text-right">Store taps</th><th /></tr>
            </thead>
            <tbody>{rows.map((r) => (
              <tr key={r.p.id} className="border-b border-line/50">
                <td className="py-2">{r.p.name}<span className="text-muted-fg text-xs"> · {r.p.kind}</span></td>
                <td className="text-right tabular-nums">{r.sold.toLocaleString()}</td>
                <td className="text-right tabular-nums">{r.gold.toLocaleString()}</td>
                <td className="text-right tabular-nums">{money(r.net)}</td>
                <td className="text-right tabular-nums">{r.owed ? money(r.owed) : "—"}<span className="text-muted-fg text-xs">{r.p.rev_share_pct ? ` (${r.p.rev_share_pct}%)` : ""}</span></td>
                <td className="text-right tabular-nums">{r.views.toLocaleString()}</td>
                <td className="text-right tabular-nums">{r.plays.toLocaleString()}</td>
                <td className="text-right tabular-nums">{r.tickets.toLocaleString()}</td>
                <td className="text-right tabular-nums">{r.storeTaps.toLocaleString()}<span className="text-muted-fg text-xs">{r.codes ? ` · ${r.codes} codes` : ""}</span></td>
                <td className="text-right"><button className="text-xs underline" onClick={() => void copy(r)}>Copy statement</button></td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td className="py-2 font-semibold" colSpan={4}>Total owed to partners</td><td className="text-right font-semibold tabular-nums">{money(totalOwed)}</td><td colSpan={5} /></tr></tfoot>
          </table>
        </div>
      )}
    </Section>
  );
}
