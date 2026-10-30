// Admin image picker: upload a photo (or paste a link) for rewards, packs, venues, release covers and more.
// Uploads go to the public "brand-assets" storage bucket. Big photos are shrunk on this computer first
// (longest side 1600px, WebP) so they load fast in the game and stay under the 5 MB limit.
import { useRef, useState } from "react";
import { supabase } from "../lib/cloud";
import { toast } from "../components/ui";
import { input } from "./kit";

const MAX_SIDE = 1600;

async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1_500_000 && file.type !== "image/heic") return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.86));
  return out ?? file;
}

export function ImageField({ label, value, onChange, folder, hint, wide }: {
  label: string;
  value: string | null | undefined;
  onChange: (url: string) => void;
  /** Storage folder, e.g. "rewards", "drops", "venues". */
  folder: string;
  hint?: string;
  wide?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const v = value ?? "";

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast({ ok: false, message: "Choose an image file (JPG, PNG or WebP)." });
    setBusy(true);
    try {
      const blob = await shrink(file);
      const type = blob.type || file.type;
      if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new Error("Use a JPG, PNG or WebP image.");
      if (blob.size > 5 * 1024 * 1024) throw new Error("That image is over 5 MB even after shrinking. Try a smaller one.");
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await supabase!.storage.from("brand-assets").upload(path, blob, { contentType: type, upsert: false, cacheControl: "31536000" });
      if (error) throw new Error(/bucket/i.test(error.message) ? "Image storage isn't set up yet (run the brand assets SQL)." : error.message);
      onChange(supabase!.storage.from("brand-assets").getPublicUrl(path).data.publicUrl);
      toast({ ok: true, message: "Image uploaded. Save to keep it." });
    } catch (e) {
      toast({ ok: false, message: (e as Error).message || "Upload failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`text-xs text-muted-fg ${wide ? "md:col-span-2" : ""}`}>
      <div>{label}</div>
      <div
        className={`mt-1 flex items-center gap-3 rounded border p-2 ${drag ? "border-pink bg-white/5" : "border-line"}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files?.[0]); }}
      >
        {v ? <img src={v} alt="" className="w-16 h-16 rounded object-cover border border-line shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }} />
          : <div className="w-16 h-16 rounded bg-black/40 border border-dashed border-line flex items-center justify-center text-xl shrink-0">🖼️</div>}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost text-xs !py-1.5" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : v ? "Replace" : "Upload image"}</button>
            {v && <button type="button" className="text-[11px] underline" onClick={() => onChange("")}>Remove</button>}
          </div>
          <input className={`${input} !py-1 !text-xs`} value={v} onChange={(e) => onChange(e.target.value.trim())} placeholder="…or paste an https link" />
          <div className="text-[10px]">{hint ?? "Drag a photo here, or upload. JPG, PNG or WebP; big photos are resized automatically."}</div>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}
