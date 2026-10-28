// VIP presales: real Ticketmaster presale codes for TourStar VIP members (and, optionally,
// high-level players). Codes are handed out by the server, one per player, and every reveal is logged.
import { create } from "zustand";
import { Browser } from "@capacitor/browser";
import { isNative } from "./native";
import { supabase, useCloud } from "./cloud";

export interface Presale {
  id: string; artist: string; title: string; description: string; emoji: string; ticket_url: string;
  starts_at: string; ends_at: string; for_vip: boolean; min_level: number | null; pack_id?: string | null; pack_name?: string | null;
  eligible: boolean; code: string | null; sold_out: boolean;
}
export const usePresales = create<{ list: Presale[]; loaded: boolean }>(() => ({ list: [], loaded: false }));

export async function refreshPresales() {
  if (!supabase) return;
  const { data } = await supabase.rpc("my_presales");
  usePresales.setState({ list: (data ?? []) as Presale[], loaded: true });
}

export async function revealCode(id: string): Promise<{ ok: boolean; message: string; code?: string }> {
  if (!supabase || !useCloud.getState().session) return { ok: false, message: "Sign in (Account tab) to get presale codes." };
  const { data, error } = await supabase.rpc("reveal_presale_code", { p_presale: id });
  if (error) return { ok: false, message: error.message };
  await refreshPresales();
  return { ok: true, message: "Your presale code is ready.", code: data as string };
}

export async function openTickets(url: string) {
  if (isNative) await Browser.open({ url });
  else window.open(url, "_blank", "noopener");
}

/** Who can get this presale, in plain words. */
export function presaleAudience(p: Pick<Presale, "for_vip" | "min_level" | "pack_id" | "pack_name">) {
  const pack = p.pack_id ? `owners of ${p.pack_name && /pack$/i.test(p.pack_name) ? p.pack_name : `the ${p.pack_name ?? "artist"} pack`}` : null;
  const who = [p.for_vip && "TourStar VIP members", p.min_level && `players at level ${p.min_level}+`, pack].filter(Boolean) as string[];
  const s = who.length > 1 ? `${who.slice(0, -1).join(", ")} and ${who[who.length - 1]}` : who[0] ?? "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
