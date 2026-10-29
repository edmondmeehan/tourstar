// Admin → Partners & venues → Drum School host. Tick the box and Drum School becomes the licensed host's
// corner: their name in the menu, photo, bio, quote, a tip on every lesson and a sign-off on great runs.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { BLANK_CORNER, loadCorner, parseCorner, type DrumCorner } from "../lib/corner";
import { LESSONS } from "../game/drums";
import { toast } from "../components/ui";
import { Section, fail, input } from "./kit";
import { licenseState, type Partner } from "./partners";

export function DrumCornerAdmin({ partners }: { partners: Partner[] | null }) {
  const [saved, setSaved] = useState<DrumCorner>(BLANK_CORNER);
  const [f, setF] = useState<DrumCorner>(BLANK_CORNER);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase!.from("app_public_config").select("value").eq("key", "drum_corner").maybeSingle();
    const c = parseCorner(data?.value ?? null);
    setSaved(c); setF(c);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const set = (patch: Partial<DrumCorner>) => setF((x) => ({ ...x, ...patch }));
  const partner = partners?.find((p) => p.id === f.partner_id) ?? null;
  const lic = licenseState(partner);
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);

  const save = async (next = f) => {
    if (next.enabled) {
      if (!next.host.trim() || !next.title.trim()) return toast({ ok: false, message: "Add the host's name and the corner title first." });
      if (!next.partner_id) return toast({ ok: false, message: "Link the partner so the corner only shows while their license is active." });
      if (partner && !lic.ok) return toast({ ok: false, message: `Can't turn it on: ${lic.label.toLowerCase()}. Add the signed license in the partner first.` });
    }
    if (next.photo_url && !/^https:\/\//i.test(next.photo_url)) return toast({ ok: false, message: "The photo link must start with https://" });
    if (next.link_url && !/^https:\/\//i.test(next.link_url)) return toast({ ok: false, message: "The link must start with https://" });
    const row = { ...next, ends_on: partner?.license_expires_on ?? null };
    const { error } = await supabase!.from("app_public_config").upsert({ key: "drum_corner", value: JSON.stringify(row), updated_at: new Date().toISOString() });
    if (error) return fail(error);
    setSaved(row); setF(row);
    void loadCorner();
    toast({ ok: true, message: row.enabled ? `Live. Drum School is now "${row.title}" for every player.` : "Saved. The corner is off; players see the regular Drum School." });
  };

  const upload = async (file: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast({ ok: false, message: "Use a JPG, PNG or WebP image." });
    if (file.size > 5 * 1024 * 1024) return toast({ ok: false, message: "Keep the photo under 5 MB." });
    setBusy(true);
    const path = `drum-corner/${Date.now()}.${file.type.split("/")[1]}`;
    const { error } = await supabase!.storage.from("brand-assets").upload(path, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (error) return fail(error.message.toLowerCase().includes("bucket") ? { message: "Run the brand assets SQL in Supabase first." } : error);
    set({ photo_url: supabase!.storage.from("brand-assets").getPublicUrl(path).data.publicUrl });
  };

  const artists = (partners ?? []).filter((p) => p.kind === "artist");
  const txt = (k: keyof DrumCorner, label: string, ph: string, max: number, area = false) => (
    <label className="block text-xs text-muted-fg">{label}
      {area
        ? <textarea className={`${input} mt-1 min-h-[70px]`} maxLength={max} placeholder={ph} value={String(f[k] ?? "")} onChange={(e) => set({ [k]: e.target.value } as Partial<DrumCorner>)} />
        : <input className={`${input} mt-1`} maxLength={max} placeholder={ph} value={String(f[k] ?? "")} onChange={(e) => set({ [k]: e.target.value } as Partial<DrumCorner>)} />}
    </label>
  );

  return (
    <Section title="Drum School host" sub="Turn Drum School into a licensed artist's corner. Players see their name in the menu and on the Tour page, their photo and bio, their tip on each lesson and a sign-off after great runs. It switches itself off when the partner's license expires.">
      <label className="flex items-start gap-3 p-3 rounded border border-line mb-4 cursor-pointer">
        <input type="checkbox" className="mt-1 accent-[var(--neon-pink)]" checked={f.enabled} onChange={(e) => void save({ ...f, enabled: e.target.checked })} />
        <span><b className="text-sm">Show Drum School as the host's corner</b>
          <span className="block text-xs text-muted-fg">{saved.enabled ? `Live now as "${saved.title}".` : "Off: players see the regular Drum School."}{saved.ends_on ? ` Ends ${saved.ends_on} with the license.` : ""}</span></span>
      </label>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-xs text-muted-fg">Licensed through partner
          <select className={`${input} mt-1`} value={f.partner_id ?? ""} onChange={(e) => set({ partner_id: e.target.value || null })}>
            <option value="">Choose the artist partner…</option>
            {artists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {partner && <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${lic.cls}`}>{lic.label || "LICENSED"}</span>}
          {!artists.length && <span className="block text-[10px] mt-1">Add them as an artist partner (with the license dates) in the section above first.</span>}
        </label>
        {txt("host", "Host name (as players see it)", "Questlove", 40)}
        {txt("title", "Corner title (menu and page)", "Questlove's Corner", 40)}
        {txt("tagline", "Tagline under the title", "Learn the pocket from the drummer who wrote the book on it.", 120)}
      </div>
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 mt-3 items-end">
        {txt("bio", "Short bio (approved copy)", "Two or three sentences from the approved bio.", 600, true)}
        <div className="text-xs text-muted-fg">
          <div>Photo (approved)</div>
          <div className="flex items-center gap-2 mt-1">
            {f.photo_url ? <img src={f.photo_url} alt="" className="w-16 h-16 rounded object-cover border border-line" /> : <div className="w-16 h-16 rounded bg-black/40 flex items-center justify-center text-2xl">🥁</div>}
            <div className="space-y-1">
              <label className="btn btn-ghost text-xs cursor-pointer block text-center">{busy ? "Uploading…" : "Upload"}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) void upload(x); e.target.value = ""; }} /></label>
              {f.photo_url && <button className="text-[11px] underline block" onClick={() => set({ photo_url: "" })}>Remove</button>}
            </div>
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        {txt("quote", "Quote on the page", "A drummer's job is to make everybody else sound good.", 200)}
        {txt("sign_off", "Sign-off after an A or S lesson", "That's the pocket. Keep it there.", 160)}
        {txt("link_url", "Link (optional, https)", "https://…", 300)}
        {txt("link_label", "Link button text", "Listen on the official site", 40)}
      </div>

      <div className="mt-4">
        <div className="text-xs text-muted-fg mb-2">The host's tip for each lesson (blank = the built-in tip)</div>
        <div className="space-y-2">
          {LESSONS.map((l) => (
            <label key={l.id} className="flex gap-2 items-start text-xs">
              <span className="w-32 shrink-0 pt-2">{l.emoji} {l.name}</span>
              <input className={input} maxLength={240} placeholder={l.tip} value={f.tips[l.id] ?? ""} onChange={(e) => set({ tips: { ...f.tips, [l.id]: e.target.value } })} />
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mt-4 items-center">
        <button className="btn btn-pink" disabled={!dirty} onClick={() => void save()}>Save</button>
        {dirty && <button className="btn btn-ghost text-xs" onClick={() => setF(saved)}>Discard changes</button>}
        <span className="text-[11px] text-muted-fg">Use only the name, photo and words the agreement approves. Players see changes on their next launch.</span>
      </div>
    </Section>
  );
}
