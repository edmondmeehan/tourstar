// Admin → Presales (Ticketmaster presale codes for VIPs / high-level players) and
// Admin → Notifications (server push to iPhones).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { askConfirm, toast } from "../components/ui";
import { Kpi, Section, errMsg, fail, input, when } from "./kit";

interface Presale {
  id: string; artist: string; title: string; description: string; emoji: string; ticket_url: string;
  presale_starts_at: string; presale_ends_at: string; code_mode: "shared" | "unique"; shared_code: string | null;
  for_vip: boolean; min_level: number | null; active: boolean; notified_at: string | null; created_at: string;
}
type Stats = Record<string, { revealed: number; codes: number; codes_left: number; vip_now: number; level_ok: number }>;
type Form = Omit<Presale, "id" | "created_at" | "notified_at" | "shared_code" | "min_level"> & { id?: string; shared_code: string; min_level: string; new_codes: string };

const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
const blank = (): Form => ({
  artist: "", title: "", description: "", emoji: "🎟️", ticket_url: "https://www.ticketmaster.com/",
  presale_starts_at: local(new Date(Date.now() + 3 * 864e5).toISOString()), presale_ends_at: local(new Date(Date.now() + 4 * 864e5).toISOString()),
  code_mode: "unique", shared_code: "", new_codes: "", for_vip: true, min_level: "", active: false,
});

async function invokePush(body: Record<string, unknown>) {
  const { data, error } = await supabase!.functions.invoke("push-send", { body });
  if (error) {
    let msg = errMsg(error);
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  return data as { devices: number; delivered: number; failed: number; removed: number; hint?: string };
}

// ================================================================= Presales
export function PresalesTab() {
  const [rows, setRows] = useState<Presale[] | null>(null);
  const [stats, setStats] = useState<Stats>({});
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      supabase!.from("presales").select("*").order("presale_starts_at", { ascending: false }),
      supabase!.rpc("admin_presale_stats"),
    ]);
    if (p.error) return fail(p.error);
    setRows(p.data as Presale[]);
    if (!s.error) setStats(s.data as Stats);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const edit = (p: Presale) => setForm({ ...p, shared_code: p.shared_code ?? "", min_level: p.min_level ? String(p.min_level) : "", new_codes: "",
    presale_starts_at: local(p.presale_starts_at), presale_ends_at: local(p.presale_ends_at) });

  const save = async () => {
    if (!form) return;
    if (!form.artist.trim() || !form.title.trim()) return toast({ ok: false, message: "Add the artist and the tour or show." });
    if (!/^https:\/\//.test(form.ticket_url.trim())) return toast({ ok: false, message: "The ticket link must start with https://" });
    if (!form.for_vip && !form.min_level) return toast({ ok: false, message: "Choose who gets it: VIP members, a level, or both." });
    const codes = form.new_codes.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean);
    if (form.code_mode === "unique" && !form.id && !codes.length) return toast({ ok: false, message: "Paste the unique codes (one per line), or switch to one shared code." });
    const row = {
      artist: form.artist.trim(), title: form.title.trim(), description: form.description.trim(), emoji: form.emoji || "🎟️", ticket_url: form.ticket_url.trim(),
      presale_starts_at: new Date(form.presale_starts_at).toISOString(), presale_ends_at: new Date(form.presale_ends_at).toISOString(),
      code_mode: form.code_mode, shared_code: form.code_mode === "shared" ? form.shared_code.trim() || null : null,
      for_vip: form.for_vip, min_level: form.min_level ? Number(form.min_level) : null, active: form.active,
    };
    setBusy(true);
    const res = form.id ? await supabase!.from("presales").update(row).eq("id", form.id).select("id") : await supabase!.from("presales").insert(row).select("id");
    if (res.error) { setBusy(false); return fail(res.error); }
    const id = res.data?.[0]?.id as string;
    if (codes.length && form.code_mode === "unique") {
      const unique = [...new Set(codes)];
      for (let i = 0; i < unique.length; i += 500) {
        const { error } = await supabase!.from("presale_codes").upsert(unique.slice(i, i + 500).map((code) => ({ presale_id: id, code })), { onConflict: "presale_id,code", ignoreDuplicates: true });
        if (error) { setBusy(false); return fail(error); }
      }
    }
    setBusy(false);
    toast({ ok: true, message: `Saved${codes.length ? ` with ${codes.length.toLocaleString()} codes` : ""}. ${form.active ? "Eligible players can see it now." : "Turn on \"Live\" when it's ready."}` });
    setForm(null);
    void load();
  };

  const toggle = (p: Presale) => askConfirm(p.active ? `Hide the ${p.artist} presale? Codes already revealed stay with players.` : `Make the ${p.artist} presale visible to eligible players?`, async () => {
    const { error } = await supabase!.from("presales").update({ active: !p.active }).eq("id", p.id);
    if (error) return fail(error);
    void load();
  }, { yes: p.active ? "Hide" : "Make live" });

  const remove = (p: Presale) => askConfirm(`Delete the ${p.artist} presale and all its codes? This can't be undone.`, async () => {
    const { error } = await supabase!.from("presales").delete().eq("id", p.id);
    if (error) return fail(error);
    void load();
  }, { yes: "Delete", danger: true });

  const notify = (p: Presale) => {
    const title = `🎟️ ${p.artist} presale`;
    const body = `Your VIP presale code for ${p.title} is ready. Presale starts ${new Date(p.presale_starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`;
    askConfirm(`Send this push to everyone eligible for the ${p.artist} presale?\n\n${title}\n${body}`, async () => {
      try {
        const r = await invokePush({ title, body, link: "/presales", audience: "presale", presale_id: p.id });
        toast({ ok: r.delivered > 0 || r.devices === 0, message: r.devices === 0 ? "No eligible players have notifications on yet." : `Sent to ${r.delivered.toLocaleString()} of ${r.devices.toLocaleString()} devices.${r.hint ? ` ${r.hint}` : ""}` });
        void load();
      } catch (e) { toast({ ok: false, message: (e as Error).message }); }
    }, { yes: "Send push" });
  };

  const exportReveals = async (p: Presale) => {
    const { data, error } = await supabase!.from("presale_reveals").select("user_id, code, revealed_at").eq("presale_id", p.id).order("revealed_at");
    if (error) return fail(error);
    const body = ["user_id,code,revealed_at", ...(data ?? []).map((r) => `${r.user_id},"${String(r.code).replace(/"/g, '""')}",${r.revealed_at}`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
    a.download = `presale-${p.artist.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-codes.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <Section title="VIP presales" sub="Ticketmaster presale codes from an artist's team, shared with TourStar VIP members and/or high-level players. One code per player; every reveal is logged. Get the artist's and promoter's written OK first, and never charge for codes."
        right={<button className="btn btn-pink text-sm" onClick={() => setForm(blank())}>+ New presale</button>}>
        {!rows ? <p className="text-sm text-muted-fg">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">No presales yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px] [&_th]:px-3 [&_td]:px-3">
              <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
                <tr className="border-b border-line"><th className="py-2">Presale</th><th>When</th><th>Who</th><th className="text-right">Codes given</th><th className="text-right">Left</th><th>Status</th><th /></tr>
              </thead>
              <tbody>{rows.map((p) => {
                const s = stats[p.id];
                const ended = Date.parse(p.presale_ends_at) < Date.now();
                return (
                  <tr key={p.id} className="border-b border-line/50">
                    <td className="py-2">{p.emoji} <b>{p.artist}</b> <span className="text-muted-fg">· {p.title}</span></td>
                    <td className="text-xs text-muted-fg whitespace-nowrap">{when(p.presale_starts_at)} → {when(p.presale_ends_at)}</td>
                    <td className="text-xs">{[p.for_vip && "VIP", p.min_level && `LV${p.min_level}+`].filter(Boolean).join(" + ")}
                      {s && <span className="text-muted-fg"> · ~{(p.for_vip ? s.vip_now : 0) + s.level_ok} eligible</span>}</td>
                    <td className="text-right tabular-nums">{s?.revealed ?? 0}</td>
                    <td className="text-right tabular-nums">{p.code_mode === "shared" ? "shared" : s ? s.codes_left : "—"}</td>
                    <td><span className={`text-[10px] px-2 py-0.5 rounded border ${ended ? "text-muted-fg border-line" : p.active ? "text-success border-success" : "text-muted-fg border-line"}`}>{ended ? "ENDED" : p.active ? "LIVE" : "HIDDEN"}</span>
                      {p.notified_at && <span className="block text-[10px] text-muted-fg mt-1">pushed {when(p.notified_at)}</span>}</td>
                    <td className="text-right whitespace-nowrap space-x-3">
                      <button className="text-xs underline" onClick={() => edit(p)}>Edit</button>
                      {p.active && !ended && <button className="text-xs underline" style={{ color: "var(--gold)" }} onClick={() => notify(p)}>Push</button>}
                      <button className="text-xs underline text-muted-fg" onClick={() => toggle(p)}>{p.active ? "Hide" : "Make live"}</button>
                      <button className="text-xs underline text-muted-fg" onClick={() => void exportReveals(p)}>CSV</button>
                      <button className="text-xs underline text-danger" onClick={() => remove(p)}>Delete</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      {form && (
        <Section title={form.id ? "Edit presale" : "New presale"} right={<button className="text-xs underline text-muted-fg" onClick={() => setForm(null)}>Cancel</button>}>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="grid grid-cols-[4rem_1fr] gap-3">
                <label className="block text-xs text-muted-fg">Emoji<input className={`${input} mt-1 text-center`} maxLength={4} value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} /></label>
                <label className="block text-xs text-muted-fg">Artist<input className={`${input} mt-1`} maxLength={80} value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} /></label>
              </div>
              <label className="block text-xs text-muted-fg">Tour or show<input className={`${input} mt-1`} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="2027 North American Tour" /></label>
              <label className="block text-xs text-muted-fg">Note for players (optional)<textarea className={`${input} mt-1 h-16`} maxLength={600} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Limit 4 tickets per code." /></label>
              <label className="block text-xs text-muted-fg">Ticketmaster link<input className={`${input} mt-1`} value={form.ticket_url} onChange={(e) => setForm({ ...form, ticket_url: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-muted-fg">Presale starts<input type="datetime-local" className={`${input} mt-1`} value={form.presale_starts_at} onChange={(e) => setForm({ ...form, presale_starts_at: e.target.value })} /></label>
                <label className="block text-xs text-muted-fg">Presale ends<input type="datetime-local" className={`${input} mt-1`} value={form.presale_ends_at} onChange={(e) => setForm({ ...form, presale_ends_at: e.target.value })} /></label>
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-xs text-muted-fg">Who can get a code</div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.for_vip} onChange={(e) => setForm({ ...form, for_vip: e.target.checked })} />TourStar VIP members</label>
              <label className="flex items-center gap-2 text-sm">Also players at level
                <select className={`${input} !w-auto`} value={form.min_level} onChange={(e) => setForm({ ...form, min_level: e.target.value })}>
                  <option value="">— (VIP only)</option>{[2, 3, 4, 5, 6, 7].map((l) => <option key={l} value={l}>LV{l}+</option>)}
                </select></label>
              <p className="text-[11px] text-muted-fg">Adding a level gives non-paying players a way to earn access too.</p>

              <div className="text-xs text-muted-fg pt-2">Codes</div>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={form.code_mode === "unique"} onChange={() => setForm({ ...form, code_mode: "unique" })} />Unique codes (one per player)</label>
                <label className="flex items-center gap-2"><input type="radio" checked={form.code_mode === "shared"} onChange={() => setForm({ ...form, code_mode: "shared" })} />One shared code</label>
              </div>
              {form.code_mode === "shared" ? (
                <label className="block text-xs text-muted-fg">Shared code (only shown to eligible players)<input className={`${input} mt-1 font-mono`} value={form.shared_code} onChange={(e) => setForm({ ...form, shared_code: e.target.value })} placeholder="TOURSTAR" /></label>
              ) : (
                <label className="block text-xs text-muted-fg">{form.id ? "Add more codes" : "Paste codes"} (one per line, or separated by commas)
                  <textarea className={`${input} mt-1 h-28 font-mono`} value={form.new_codes} onChange={(e) => setForm({ ...form, new_codes: e.target.value })} placeholder={"A1B2C3D4\nE5F6G7H8"} />
                  {!!form.new_codes.trim() && <span className="block mt-1">{form.new_codes.split(/[\s,;]+/).filter(Boolean).length.toLocaleString()} codes</span>}
                </label>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Live (eligible players see it in the game)</label>
              <button className="btn btn-pink" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save presale"}</button>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}

// ================================================================= Notifications
interface Msg { id: string; title: string; body: string; audience: string; devices: number; delivered: number; failed: number; sent_at: string | null; created_at: string }
const AUDIENCE: Record<string, string> = { all: "Everyone with notifications on", vip: "VIP members", inactive: "Players away 3+ days", test: "Just me (test)", presale: "Presale" };
const LINKS: [string, string][] = [["/dashboard", "Home"], ["/store?tab=drops", "Store → Drops"], ["/presales", "VIP Presales"], ["/premium", "Premium"], ["/tour", "Tour"], ["/album", "Album"], ["/store", "Rewards store"]];

export function NotificationsTab() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [m, setM] = useState({ title: "", body: "", link: "/dashboard", audience: "test" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, h, s] = await Promise.all([
      supabase!.rpc("admin_push_counts"),
      supabase!.from("push_messages").select("*").order("created_at", { ascending: false }).limit(30),
      supabase!.rpc("admin_list_secrets"),
    ]);
    if (c.error) return fail(c.error);
    setCounts(c.data as Record<string, number>);
    setMsgs((h.data ?? []) as Msg[]);
    if (!s.error) setReady(["apns_key_p8", "apns_key_id", "apns_team_id"].every((n) => (s.data as { name: string }[]).some((r) => r.name === n)));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = () => {
    if (!m.title.trim() || !m.body.trim()) return toast({ ok: false, message: "Add a title and a message." });
    const n = counts?.[m.audience === "test" ? "mine" : m.audience] ?? 0;
    askConfirm(`Send to ${AUDIENCE[m.audience]} (${n.toLocaleString()} device${n === 1 ? "" : "s"})?\n\n${m.title}\n${m.body}`, async () => {
      setBusy(true);
      try {
        const r = await invokePush(m);
        toast({ ok: r.failed === 0, message: `Delivered to ${r.delivered.toLocaleString()} of ${r.devices.toLocaleString()} devices${r.removed ? ` (${r.removed} old devices removed)` : ""}.${r.hint ? ` ${r.hint}` : ""}` });
        if (m.audience !== "test") setM({ ...m, title: "", body: "" });
      } catch (e) { toast({ ok: false, message: (e as Error).message }); }
      setBusy(false);
      void load();
    }, { yes: "Send", danger: m.audience === "all" });
  };

  return (
    <>
      {ready === false && <div className="panel p-4 mb-5 text-sm" style={{ borderColor: "var(--gold)" }}>○ Push isn't connected yet. After your Apple Developer account is set up, create an APNs key and add it in <b>Integrations → Push notifications</b>. Reminders (energy, royalties, streak, quests) already work without this.</div>}
      <div className="grid sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Devices with push" value={counts ? counts.all.toLocaleString() : "—"} sub={counts ? `${counts.signed_in.toLocaleString()} signed in` : undefined} />
        <Kpi label="VIP devices" value={counts ? counts.vip.toLocaleString() : "—"} />
        <Kpi label="Away 3+ days" value={counts ? counts.inactive.toLocaleString() : "—"} />
        <Kpi label="Your devices" value={counts ? counts.mine.toLocaleString() : "—"} sub="Open the app and allow notifications to test" />
      </div>
      <Section title="Send a notification" sub="Keep it short and worth opening. Players turn notifications off if they get too many: aim for 2–3 a week at most.">
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="block text-xs text-muted-fg">Title ({m.title.length}/80)<input className={`${input} mt-1`} maxLength={80} value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} placeholder="🔥 Inferno Weekend is live" /></label>
            <label className="block text-xs text-muted-fg">Message ({m.body.length}/240)<textarea className={`${input} mt-1 h-20`} maxLength={240} value={m.body} onChange={(e) => setM({ ...m, body: e.target.value })} placeholder="Turn your stage into a furnace. 3 days only." /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted-fg">Opens<select className={`${input} mt-1`} value={m.link} onChange={(e) => setM({ ...m, link: e.target.value })}>{LINKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="block text-xs text-muted-fg">Send to<select className={`${input} mt-1`} value={m.audience} onChange={(e) => setM({ ...m, audience: e.target.value })}>
                {["test", "all", "vip", "inactive"].map((a) => <option key={a} value={a}>{AUDIENCE[a]}{counts ? ` (${(counts[a === "test" ? "mine" : a] ?? 0).toLocaleString()})` : ""}</option>)}</select></label>
            </div>
            <button className="btn btn-pink" disabled={busy || !ready} onClick={send}>{busy ? "Sending…" : m.audience === "test" ? "Send test to me" : "Send"}</button>
          </div>
          <div>
            <div className="text-xs text-muted-fg mb-2">Preview</div>
            <div className="rounded-2xl p-3 bg-white/10 backdrop-blur text-sm max-w-sm">
              <div className="flex items-center gap-2 text-[11px] text-muted-fg mb-1"><span className="w-4 h-4 rounded bg-[var(--neon-pink)] inline-block" />TOURSTAR · now</div>
              <div className="font-semibold">{m.title || "Title"}</div>
              <div className="text-fg/80">{m.body || "Your message"}</div>
            </div>
          </div>
        </div>
      </Section>
      <Section title="Sent">
        {msgs.length === 0 ? <p className="text-sm text-muted-fg">Nothing sent yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {msgs.map((x) => (
              <li key={x.id} className="py-2 flex gap-3 items-baseline">
                <span className="flex-1 min-w-0"><b>{x.title}</b> <span className="text-muted-fg truncate">· {x.body}</span></span>
                <span className="text-xs text-muted-fg whitespace-nowrap">{AUDIENCE[x.audience]}</span>
                <span className="text-xs tabular-nums whitespace-nowrap">{x.delivered}/{x.devices}{x.failed ? <span className="text-danger"> · {x.failed} failed</span> : null}</span>
                <span className="text-[11px] text-muted-fg whitespace-nowrap">{when(x.sent_at ?? x.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
