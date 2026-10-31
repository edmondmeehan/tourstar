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
  announceNewItems(owned);
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

const REGIONS_KEY = "ts_owned_regions";
/** Touring regions this player owns (from packs). Cached on the device so they still work offline. */
export function ownedRegions(): string[] {
  const { owned, loaded } = useGold.getState();
  if (loaded) {
    const ids = owned.flatMap((o) => o.items).filter((i): i is { type: "region"; id: string } => i.type === "region").map((i) => i.id);
    try { localStorage.setItem(REGIONS_KEY, JSON.stringify(ids)); } catch { /* fine */ }
    return ids;
  }
  try { return JSON.parse(localStorage.getItem(REGIONS_KEY) ?? "[]") as string[]; } catch { return []; }
}

const SEEN_KEY = "ts_seen_badges";
/** When a new badge or title arrives (a merch order, a waitlist reward, a pack), say so and wear it if nothing is equipped. */
function announceNewItems(owned: Owned[]) {
  const c = useGame.getState().career;
  if (!c) return;
  const items = owned.flatMap((o) => o.items).filter((i): i is Extract<DropItem, { type: "badge" }> | Extract<DropItem, { type: "title" }> => i.type === "badge" || i.type === "title");
  const keys = items.map((i) => (i.type === "badge" ? `b:${i.emoji}` : `t:${i.name}`));
  let seen: string[] | null = null;
  try { const v = localStorage.getItem(SEEN_KEY); seen = v ? (JSON.parse(v) as string[]) : null; } catch { /* private mode */ }
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(keys)])); } catch { /* fine */ }
  // First run on this device: just remember what they have (but still wear a badge if none is on).
  const fresh = seen === null ? [] : items.filter((_, n) => !seen!.includes(keys[n]));
  const style = c.style ?? {};
  const badge = (fresh.find((i) => i.type === "badge") ?? (!style.badge ? items.find((i) => i.type === "badge") : undefined)) as Extract<DropItem, { type: "badge" }> | undefined;
  if (badge && !style.badge) useGame.getState().setStyle({ badge: badge.emoji });
  for (const i of fresh) {
    void import("../components/ui").then(({ toast }) => toast({ ok: true, title: i.type === "badge" ? "New badge!" : "New title!",
      message: i.type === "badge" ? `${i.emoji} ${i.name ?? "Badge"} is yours${!style.badge ? " and now shows next to your name" : ""}. Change it in Career → Look.` : `"${i.name}" is yours. Wear it from Career → Look.` }));
  }
}
