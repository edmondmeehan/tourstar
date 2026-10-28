// Real-world perks that come with artist packs: a merch-store discount code (shared or one per buyer)
// and a link to the artist's store. Codes live on the server and are only handed to pack owners.
import { create } from "zustand";
import { supabase, useCloud } from "./cloud";
import { openTickets } from "./presales";

export interface PackPerk {
  drop_id: string; pack: string; emoji: string; merch_url: string | null; merch_label: string; discount_text: string;
  has_code: boolean; code: string | null; sold_out: boolean;
}
export const usePackPerks = create<{ list: PackPerk[] }>(() => ({ list: [] }));

export async function refreshPackPerks() {
  if (!supabase || !useCloud.getState().session) return usePackPerks.setState({ list: [] });
  const { data, error } = await supabase.rpc("my_pack_perks");
  if (!error) usePackPerks.setState({ list: (data ?? []) as PackPerk[] });
}

export async function revealPackCode(dropId: string): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: "Offline." };
  const { error } = await supabase.rpc("reveal_pack_code", { p_drop: dropId });
  if (error) return { ok: false, message: error.message };
  await refreshPackPerks();
  return { ok: true, message: "Your discount code is ready." };
}

export async function openMerch(p: PackPerk) {
  if (!p.merch_url) return;
  if (supabase) void supabase.rpc("pack_perk_tap", { p_drop: p.drop_id });
  await openTickets(p.merch_url);
}
