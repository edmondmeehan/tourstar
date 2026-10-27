// Rewards store + raffles. Items and raffles are managed in /admin; spending happens in
// database functions (redeem_reward / enter_raffle) so balances can't be spent twice.
import { create } from "zustand";
import { supabase, syncNow, useCloud } from "./cloud";

export interface RewardItem {
  id: string;
  name: string;
  description: string;
  emoji: string;
  image_url: string | null;
  category: string;
  cost_points: number;
  min_level: number;
  stock: number | null;
  per_user_limit: number | null;
  needs_shipping: boolean;
  options: string[];
  active: boolean;
  sort: number;
}

export interface Raffle {
  id: string;
  title: string;
  prize: string;
  description: string;
  emoji: string;
  image_url: string | null;
  prize_value_usd: number | null;
  ticket_cost: number;
  min_level: number;
  max_tickets_per_user: number | null;
  free_daily_entry: boolean;
  starts_at: string;
  ends_at: string;
  status: "draft" | "open" | "closed" | "drawn";
  rules: string;
  winner_name: string | null;
  drawn_at: string | null;
}

export interface Redemption {
  id: string;
  item_name: string;
  option: string | null;
  cost_points: number;
  status: "pending" | "approved" | "shipped" | "fulfilled" | "rejected";
  created_at: string;
}

export interface Points { earned: number; spent: number; balance: number; level: number }

interface RewardsState {
  items: RewardItem[];
  raffles: Raffle[];
  points: Points | null;
  redemptions: Redemption[];
  myTickets: Record<string, { total: number; freeToday: boolean }>;
  loading: boolean;
  error: string | null;
  loadedAt: number;
}

export const useRewards = create<RewardsState>(() => ({
  items: [], raffles: [], points: null, redemptions: [], myTickets: {}, loading: false, error: null, loadedAt: 0,
}));

const msg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "Something went wrong.");
const today = () => new Date().toISOString().slice(0, 10);

export async function loadRewards() {
  if (!supabase) return;
  useRewards.setState({ loading: true, error: null });
  const signedIn = !!useCloud.getState().session;
  try {
    const [items, raffles] = await Promise.all([
      supabase.from("reward_items").select("*").eq("active", true).order("sort").order("cost_points"),
      supabase.from("raffles").select("*").neq("status", "draft").order("ends_at"),
    ]);
    if (items.error) throw items.error;
    if (raffles.error) throw raffles.error;
    const next: Partial<RewardsState> = { items: items.data as RewardItem[], raffles: raffles.data as Raffle[] };
    if (signedIn) {
      await syncNow();
      const [pts, red, ent] = await Promise.all([
        supabase.rpc("my_points"),
        supabase.from("reward_redemptions").select("id, item_name, option, cost_points, status, created_at").order("created_at", { ascending: false }).limit(50),
        supabase.from("raffle_entries").select("raffle_id, tickets, source, entry_day"),
      ]);
      if (!pts.error) next.points = pts.data as Points;
      if (!red.error) next.redemptions = red.data as Redemption[];
      if (!ent.error) {
        const t: RewardsState["myTickets"] = {};
        for (const e of ent.data as { raffle_id: string; tickets: number; source: string; entry_day: string }[]) {
          const cur = (t[e.raffle_id] ??= { total: 0, freeToday: false });
          cur.total += e.tickets;
          if (e.source === "free" && e.entry_day === today()) cur.freeToday = true;
        }
        next.myTickets = t;
      }
    } else {
      next.points = null; next.redemptions = []; next.myTickets = {};
    }
    useRewards.setState({ ...next, loading: false, loadedAt: Date.now() });
  } catch (e) {
    useRewards.setState({ loading: false, error: msg(e) });
  }
}

export interface ShipTo { name: string; address: string; email: string; phone: string }

export async function redeem(item: RewardItem, option: string | null, ship: ShipTo) {
  if (!supabase) return { ok: false, message: "Rewards aren't available in this build." };
  await syncNow();
  const { error } = await supabase.rpc("redeem_reward", {
    p_item: item.id, p_option: option, p_name: ship.name, p_address: ship.address, p_email: ship.email, p_phone: ship.phone,
  });
  if (error) return { ok: false, message: msg(error) };
  void loadRewards();
  return { ok: true, message: `Redeemed ${item.name}! We'll email you when it ships.` };
}

export async function enterRaffle(r: Raffle, tickets: number, free: boolean) {
  if (!supabase) return { ok: false, message: "Raffles aren't available in this build." };
  await syncNow();
  const { error } = await supabase.rpc("enter_raffle", { p_raffle: r.id, p_tickets: tickets, p_free: free });
  if (error) return { ok: false, message: msg(error) };
  void loadRewards();
  return { ok: true, message: free ? "Free entry in. Good luck!" : `${tickets} ticket${tickets > 1 ? "s" : ""} entered. Good luck!` };
}

/** Shown on every raffle (sweepstakes rules: free entry, sponsor, and Apple disclaimer). */
export const RAFFLE_DISCLAIMER =
  "No purchase necessary. Tickets use reward points earned by playing; points can't be bought. A free entry is available every day. " +
  "Sponsored by Please & Thank You, Inc. Apple is not a sponsor of, and is not involved in, this raffle.";
