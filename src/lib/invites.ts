// Referrals: waitlist invite rewards (claimed automatically when the same email signs in) and
// player invite codes (a friend enters your code in their first week; when they play a show you get
// 300 points and they get 200). All grants happen in the database, once each.
import { create } from "zustand";
import { supabase, syncNow, useCloud } from "./cloud";
import { toast } from "../components/ui";
import { track } from "./analytics";

export interface Invite { code: string; invited_by: boolean; can_enter_code: boolean; joined: number; rewarded: number; points: number; bonus_tickets: number }
export const useInvite = create<{ invite: Invite | null }>(() => ({ invite: null }));

export const INVITE_POINTS = 300;
export const INVITED_POINTS = 200;
const PENDING = "ts_invite_pending";

export const inviteText = (code: string) =>
  `Play TourStar with me 🎸 the music career game where you play every show. Use my invite code ${code.toUpperCase()} in your first week and we both get reward points: https://tourstarapp.com/?i=${code}`;

export async function loadInvite() {
  if (!supabase || !useCloud.getState().session) return useInvite.setState({ invite: null });
  const { data, error } = await supabase.rpc("my_invite");
  if (!error) useInvite.setState({ invite: data as Invite });
}

export async function enterInviteCode(code: string): Promise<{ ok: boolean; message: string }> {
  if (!supabase || !useCloud.getState().session) return { ok: false, message: "Sign in to use an invite code." };
  await syncNow();
  const { error } = await supabase.rpc("claim_invite", { p_code: code.trim().toLowerCase() });
  if (error) return { ok: false, message: error.message };
  track("invite_code_used");
  void loadInvite();
  return { ok: true, message: `Invite code added! Play a show and you both get points (+${INVITED_POINTS} ⭐ for you).` };
}

/** On sign-in: apply an invite code from a link, then collect any waitlist rewards. */
async function onSignedIn() {
  if (!supabase) return;
  await syncNow().catch(() => undefined);
  let pending: string | null = null;
  try { pending = localStorage.getItem(PENDING); } catch { /* private mode */ }
  if (pending) {
    const r = await enterInviteCode(pending);
    try { localStorage.removeItem(PENDING); } catch { /* fine */ }
    if (r.ok) toast(r);
  }
  const { data } = await supabase.rpc("claim_waitlist_rewards");
  const granted = ((data as { granted?: string[] } | null)?.granted ?? []);
  if (granted.length) {
    toast({ ok: true, title: "Thanks for spreading the word!", message: `Waitlist rewards added: ${granted.join(" · ")}` });
    void import("./rewards").then((m) => m.loadRewards());
    void import("./gold").then((m) => m.refreshGold());
  }
  void loadInvite();
}

let started = false;
export function startInvites() {
  if (started) return;
  started = true;
  // Remember an invite code from a link (?i=code or ?invite=code) until the player signs in.
  try {
    const p = new URLSearchParams(window.location.search);
    const code = p.get("i") ?? p.get("invite");
    if (code && /^[a-z0-9]{4,12}$/i.test(code)) localStorage.setItem(PENDING, code.toLowerCase());
  } catch { /* fine */ }
  if (useCloud.getState().session) void onSignedIn();
  useCloud.subscribe((s, prev) => { if (s.session?.user.id && s.session.user.id !== prev.session?.user.id) void onSignedIn(); });
}

/** Enter bonus raffle tickets (from referral rewards) into an open raffle. */
export async function enterBonusTickets(r: { id: string }): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: "Raffles aren't available in this build." };
  const { data, error } = await supabase.rpc("use_bonus_tickets", { p_raffle: r.id });
  if (error) return { ok: false, message: error.message };
  void loadInvite();
  void import("./rewards").then((m) => m.loadRewards());
  const n = (data as { entered: number }).entered;
  return { ok: true, message: `${n} bonus ticket${n === 1 ? "" : "s"} entered. Good luck!` };
}
