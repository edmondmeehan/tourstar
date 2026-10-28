// Gold Records 💿 (premium currency) and Drops (limited-time packs).
// Gold is bought with real money through the App Store (RevenueCat → server), so the balance and
// every purchase live on the server; the game only shows them. Gold can never become reward points.
import { create } from "zustand";
import { supabase, useCloud } from "./cloud";
import { useGame } from "../game/store";
import type { DropItem } from "../game/cosmetics";

export interface Drop {
  id: string; name: string; description: string; emoji: string; image_url: string | null;
  kind: "bundle" | "artist" | "starter" | "season"; price_gold: number; was_gold: number | null;
  items: DropItem[]; starts_at: string; ends_at: string | null; new_players_days: number | null; min_level: number; sort: number;
}
interface Owned { id: string; drop_id: string | null; name: string; items: DropItem[]; at: string }

interface GoldState {
  gold: number;
  owned: Owned[];
  accountDays: number;
  drops: Drop[];
  loaded: boolean;
}
export const useGold = create<GoldState>(() => ({ gold: 0, owned: [], accountDays: 0, drops: [], loaded: false }));

/** Everything the player owns, flattened (for equipping stages, titles and badges). */
export const ownedItems = () => useGold.getState().owned.flatMap((o) => o.items);

export async function refreshGold() {
  if (!supabase) return;
  const { data: drops } = await supabase.from("drops").select("*").order("sort").order("starts_at", { ascending: false });
  if (!useCloud.getState().session) return useGold.setState({ gold: 0, owned: [], accountDays: 0, drops: (drops ?? []) as Drop[], loaded: true });
  const { data } = await supabase.rpc("my_gold");
  const owned = (data?.owned ?? []) as Owned[];
  useGold.setState({ gold: Number(data?.gold) || 0, owned, accountDays: Number(data?.account_days) || 0, drops: (drops ?? []) as Drop[], loaded: true });
  void import("./packperks").then((m) => m.refreshPackPerks());
  // Unpack game cash/energy from drops bought on another device (each purchase only once).
  for (const o of owned) useGame.getState().claimDrop(o.id, o.items as { type: string; amount?: number }[], o.name);
}

/** Drops this player can see right now (starter offers only for new accounts, not already owned). */
export function visibleDrops() {
  const { drops, owned, accountDays } = useGold.getState();
  return drops.filter((d) => (d.new_players_days === null || accountDays < d.new_players_days) && !owned.some((o) => o.drop_id === d.id));
}

export async function buyDrop(d: Drop): Promise<{ ok: boolean; message: string }> {
  if (!supabase || !useCloud.getState().session) return { ok: false, message: "Sign in to buy drops." };
  const { error } = await supabase.rpc("buy_drop", { p_drop: d.id });
  if (error) return { ok: false, message: error.message };
  await refreshGold();
  const perks = d.items.some((i) => i.type === "perk");
  return { ok: true, message: `${d.emoji} ${d.name} is yours! Equip it from My style.${perks ? " Your perks are below." : ""}` };
}

let started = false;
export function startGold() {
  if (started || !supabase) return;
  started = true;
  void refreshGold();
  window.setInterval(() => void refreshGold(), 5 * 60_000);
  useCloud.subscribe((s, p) => { if (s.session?.user.id !== p.session?.user.id) void refreshGold(); });
}
