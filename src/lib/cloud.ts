// Accounts + cloud save (Supabase). Guests play locally; signing in syncs the career to the cloud.
import { createClient, type Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import { gameStorage, isNative } from "./native";
import { useGame } from "../game/store";
import { useMembership, useSettings } from "../game/settings";
import type { Career } from "../game/types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const cloudConfigured = !!(SUPABASE_URL && KEY);

/** Deep link the native app registers (Info.plist / AndroidManifest). */
export const NATIVE_SCHEME = "co.please.tourstar";

export const supabase = cloudConfigured
  ? createClient(SUPABASE_URL!, KEY!, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !isNative,
        storage: {
          getItem: (k) => gameStorage.getItem(k) as string | null | Promise<string | null>,
          setItem: (k, v) => gameStorage.setItem(k, v) as void | Promise<void>,
          removeItem: (k) => gameStorage.removeItem(k) as void | Promise<void>,
        },
      },
    })
  : null;

export type SyncState = "guest" | "unconfirmed" | "syncing" | "synced" | "offline" | "error";

interface Conflict {
  local: Career;
  cloud: Career;
  cloudSettings: unknown;
  cloudMembership: unknown;
}

interface CloudState {
  session: Session | null;
  email: string | null;
  pendingEmail: string | null; // signed up, waiting on confirmation
  sync: SyncState;
  lastSyncedAt: number | null;
  conflict: Conflict | null;
  promptDismissed: boolean;
  isAdmin: boolean;
  localUpdatedAt: number;
  set: (p: Partial<CloudState>) => void;
}

export const useCloud = create<CloudState>()(
  persist(
    (set) => ({
      session: null,
      email: null,
      pendingEmail: null,
      sync: "guest",
      lastSyncedAt: null,
      conflict: null,
      promptDismissed: false,
      isAdmin: false,
      localUpdatedAt: 0,
      set: (p) => set(p),
    }),
    {
      name: "tourstar-cloud",
      storage: createJSONStorage(() => gameStorage),
      partialize: (s) => ({ pendingEmail: s.pendingEmail, promptDismissed: s.promptDismissed, localUpdatedAt: s.localUpdatedAt, lastSyncedAt: s.lastSyncedAt }),
    },
  ),
);

const redirectTo = (path: string) => (isNative ? `${NATIVE_SCHEME}://${path}` : `${window.location.origin}/${path}`);

function friendly(msg: string) {
  if (/invalid login/i.test(msg)) return "That email and password don't match. Check them, or reset your password.";
  if (/already registered/i.test(msg)) return "There's already an account with that email. Sign in instead.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first. Check your inbox for the link.";
  if (/password.*(6|characters)/i.test(msg)) return "Use a password with at least 8 characters.";
  if (/rate limit/i.test(msg)) return "Too many tries. Wait a minute and try again.";
  if (/fetch|network/i.test(msg)) return "Can't reach the server. Check your connection and try again.";
  return msg;
}

export interface AuthResult { ok: boolean; message: string }

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: "Accounts aren't set up in this build." };
  if (password.length < 8) return { ok: false, message: "Use a password with at least 8 characters." };
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo("auth/callback") } });
  if (error) return { ok: false, message: friendly(error.message) };
  if (!data.session) {
    useCloud.getState().set({ pendingEmail: email, sync: "unconfirmed" });
    return { ok: true, message: `Check ${email} for a confirmation link. Your career keeps saving on this device until then.` };
  }
  return { ok: true, message: "Account created. Your career is saved to the cloud." };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: "Accounts aren't set up in this build." };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, message: "Signed in." };
}

export async function signInWithProvider(provider: "apple" | "google"): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: "Accounts aren't set up in this build." };
  if (!isNative) {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo("auth/callback") } });
    return error ? { ok: false, message: friendly(error.message) } : { ok: true, message: "Redirecting…" };
  }
  if (provider === "apple" && Capacitor.getPlatform() === "ios") return nativeAppleSignIn();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo("auth/callback"), skipBrowserRedirect: true } });
  if (error || !data.url) return { ok: false, message: friendly(error?.message ?? "Couldn't start sign-in.") };
  await Browser.open({ url: data.url, presentationStyle: "popover" });
  return { ok: true, message: "Finish signing in, then come back to TourStar." };
}

/** iPhone: Apple's own sign-in sheet (Face ID), then hand Apple's token to Supabase. */
async function nativeAppleSignIn(): Promise<AuthResult> {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const hashed = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    const { response } = await SignInWithApple.authorize({
      clientId: "co.please.tourstar",
      redirectURI: "https://vtpgrxavyspadmubfwtb.supabase.co/auth/v1/callback",
      scopes: "email name",
      nonce: hashed,
    });
    const { error } = await supabase!.auth.signInWithIdToken({ provider: "apple", token: response.identityToken, nonce: raw });
    if (error) return { ok: false, message: friendly(error.message) };
    return { ok: true, message: "Signed in with Apple." };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/cancel|1001/i.test(msg)) return { ok: false, message: "Sign in cancelled." };
    return { ok: false, message: "Apple sign-in didn't work. Try again or use email." };
  }
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: "Accounts aren't set up in this build." };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo("reset-password") });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, message: `If ${email} has an account, a reset link is on its way.` };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: "Accounts aren't set up in this build." };
  if (password.length < 8) return { ok: false, message: "Use a password with at least 8 characters." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, message: "Password updated." };
}

export async function resendConfirmation(): Promise<AuthResult> {
  const email = useCloud.getState().pendingEmail;
  if (!supabase || !email) return { ok: false, message: "No pending sign-up." };
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo("auth/callback") } });
  return error ? { ok: false, message: friendly(error.message) } : { ok: true, message: `Sent another link to ${email}.` };
}

/** Signs out. The career stays on this device as a guest save. */
export async function signOut() {
  await supabase?.auth.signOut();
  useCloud.getState().set({ session: null, email: null, sync: "guest", conflict: null });
}

/** Deletes the account and its cloud save (App Store requirement). Local save is kept. */
export async function deleteAccount(): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: "Accounts aren't set up in this build." };
  const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
  if (error) return { ok: false, message: "Couldn't delete the account. Try again in a moment." };
  await signOut();
  return { ok: true, message: "Account deleted. Your career is still on this device." };
}

// ---------------------------------------------------------------- sync

let pushTimer: number | undefined;
let applyingRemote = false;

function snapshot() {
  const s = useSettings.getState();
  const m = useMembership.getState();
  return {
    career: useGame.getState().career,
    settings: { volume: s.volume, muted: s.muted, vibration: s.vibration },
    membership: { removeTimers: m.removeTimers, premiumPass: m.premiumPass, vipBadge: m.vipBadge, purchases: m.purchases },
  };
}

async function push() {
  const { session } = useCloud.getState();
  if (!supabase || !session) return;
  useCloud.getState().set({ sync: "syncing" });
  const snap = snapshot();
  const { error } = await supabase.from("saves").upsert({
    user_id: session.user.id,
    ...snap,
    client_updated_at: new Date(useCloud.getState().localUpdatedAt || Date.now()).toISOString(),
  });
  useCloud.getState().set(error ? { sync: navigator.onLine === false ? "offline" : "error" } : { sync: "synced", lastSyncedAt: Date.now() });
}

/** Upload the save right now (before spending points, so the server sees the latest earnings). */
export async function syncNow() {
  window.clearTimeout(pushTimer);
  await push();
}

function schedulePush() {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void push(), 2000);
}

/** Replace local state with the cloud save. */
export function applyCloudSave(row: { career: Career | null; settings: unknown; membership: unknown }) {
  applyingRemote = true;
  useGame.setState({ career: row.career, celebrations: [], lastOutcome: null });
  if (row.settings) useSettings.setState(row.settings as Partial<ReturnType<typeof useSettings.getState>>);
  if (row.membership) useMembership.setState(row.membership as Partial<ReturnType<typeof useMembership.getState>>);
  applyingRemote = false;
  useCloud.getState().set({ conflict: null, localUpdatedAt: Date.now() });
  void push();
}

export function keepLocalSave() {
  useCloud.getState().set({ conflict: null, localUpdatedAt: Date.now() });
  void push();
}

/** On sign-in: decide whether to upload the local career, download the cloud one, or ask. */
async function reconcile() {
  const { session } = useCloud.getState();
  if (!supabase || !session) return;
  useCloud.getState().set({ sync: "syncing" });
  const { data, error } = await supabase.from("saves").select("career, settings, membership, client_updated_at").eq("user_id", session.user.id).maybeSingle();
  if (error) { useCloud.getState().set({ sync: navigator.onLine === false ? "offline" : "error" }); return; }
  const local = useGame.getState().career;
  const cloud = (data?.career ?? null) as Career | null;
  if (!cloud) return void push();
  if (!local) return applyCloudSave(data!);
  if (cloud.id === local.id) {
    const cloudTime = Date.parse(data!.client_updated_at as string);
    if (cloudTime > (useCloud.getState().localUpdatedAt || 0)) return applyCloudSave(data!);
    return void push();
  }
  // Two different careers: let the player choose.
  useCloud.getState().set({ conflict: { local, cloud, cloudSettings: data!.settings, cloudMembership: data!.membership }, sync: "synced" });
}

function onSession(session: Session | null) {
  const prev = useCloud.getState().session;
  useCloud.getState().set({
    session,
    email: session?.user.email ?? null,
    pendingEmail: session ? null : useCloud.getState().pendingEmail,
    sync: session ? "syncing" : useCloud.getState().pendingEmail ? "unconfirmed" : "guest",
  });
  if (session && session.user.id !== prev?.user.id) {
    void reconcile();
    void supabase!.rpc("claim_admin_invite").then(({ data }) => useCloud.getState().set({ isAdmin: !!data }));
  }
  if (!session) useCloud.getState().set({ isAdmin: false });
}

let started = false;
/** Call once at startup, after local saves have loaded. */
export function startCloud(onDeepLink: (path: string) => void) {
  if (started || !supabase) return;
  started = true;

  // Every local change marks the save dirty and queues an upload.
  const touch = () => {
    if (applyingRemote) return;
    useCloud.getState().set({ localUpdatedAt: Date.now() });
    if (useCloud.getState().session && !useCloud.getState().conflict) schedulePush();
  };
  useGame.subscribe((s, p) => { if (s.career !== p.career) touch(); });
  useSettings.subscribe(touch);
  useMembership.subscribe(touch);

  supabase.auth.onAuthStateChange((event, session) => {
    onSession(session);
    if (event === "PASSWORD_RECOVERY") onDeepLink("/reset-password");
  });
  void supabase.auth.getSession().then(({ data }) => onSession(data.session));

  window.addEventListener("online", () => { if (useCloud.getState().session) schedulePush(); });

  if (isNative) {
    // OAuth, email confirmation and password-reset links come back as co.please.tourstar://… deep links.
    void CapApp.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith(`${NATIVE_SCHEME}://`)) return;
      const u = new globalThis.URL(url.replace(`${NATIVE_SCHEME}://`, "https://app/"));
      const code = u.searchParams.get("code");
      void Browser.close().catch(() => {});
      if (code) await supabase!.auth.exchangeCodeForSession(code);
      if (u.pathname.startsWith("/reset-password")) onDeepLink("/reset-password");
      else onDeepLink("/account");
    });
  }
}
