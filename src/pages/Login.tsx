import { COPYRIGHT } from "../lib/site";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Logo } from "../components/HeroBackdrop";
import { Card, toast } from "../components/ui";
import { cloudConfigured, resendConfirmation, sendPasswordReset, signIn, signInWithProvider, signUp, updatePassword, useCloud, type AuthResult } from "../lib/cloud";

function Shell({ children, title, sub }: { children: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="min-h-screen max-w-md mx-auto px-4 pb-12" style={{ paddingTop: "max(2rem, calc(env(safe-area-inset-top) + 1rem))" }}>
      <div className="flex justify-center mb-6"><Logo size="sm" /></div>
      <h1 className="font-pixel text-sm text-center text-glow-pink" style={{ color: "var(--neon-pink)" }}>{title}</h1>
      {sub && <p className="text-center text-xs text-muted-fg mt-3 mb-2">{sub}</p>}
      <div className="mt-6">{children}</div>
      <p className="text-center text-[10px] text-muted-fg mt-10">{COPYRIGHT}</p>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, id, ...rest } = props;
  return (
    <label htmlFor={id} className="block mb-3">
      <span className="font-pixel text-[8px] text-muted-fg">{label}</span>
      <input id={id} {...rest} className="w-full mt-2 px-3 py-3 rounded bg-black/50 border border-line outline-none focus:border-pink text-base" />
    </label>
  );
}

function ProviderButtons({ onResult }: { onResult: (r: AuthResult) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (p: "apple" | "google") => {
    setBusy(p);
    const r = await signInWithProvider(p);
    setBusy(null);
    if (!r.ok) onResult(r);
  };
  return (
    <div className="grid gap-2">
      <button type="button" className="btn w-full !text-[10px] bg-white text-black border-white" disabled={!!busy} onClick={() => go("apple")}>
        {busy === "apple" ? "Opening…" : "Continue with Apple"}
      </button>
      <button type="button" className="btn w-full !text-[10px] bg-[#1a1f33] border-line" disabled={!!busy} onClick={() => go("google")}>
        {busy === "google" ? "Opening…" : "Continue with Google"}
      </button>
    </div>
  );
}

/** /login — create an account or sign in. Guests reach it from the save prompt or Account. */
export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signup" | "signin" | "forgot">(params.get("mode") === "signin" ? "signin" : "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const session = useCloud((s) => s.session);
  const pending = useCloud((s) => s.pendingEmail);

  useEffect(() => { if (session) nav("/account", { replace: true }); }, [session, nav]);

  if (!cloudConfigured) {
    return <Shell title="ACCOUNTS"><Card>Accounts aren't set up in this build. Your career saves on this device.</Card></Shell>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const r = mode === "signup" ? await signUp(email.trim(), password) : mode === "signin" ? await signIn(email.trim(), password) : await sendPasswordReset(email.trim());
    setBusy(false);
    if (r.ok && (mode !== "signin")) setNotice(r.message);
    toast({ ok: r.ok, message: r.message });
  };

  const title = mode === "signup" ? "SAVE YOUR CAREER" : mode === "signin" ? "WELCOME BACK" : "RESET PASSWORD";
  const sub = mode === "signup" ? "Create an account to keep your career safe and play on any device." : mode === "signin" ? "Sign in to load your career from the cloud." : "We'll email you a link to set a new password.";

  return (
    <Shell title={title} sub={sub}>
      {pending && mode === "signup" && (
        <Card glow="gold" className="mb-4 text-sm">
          Waiting for you to confirm <b>{pending}</b>.{" "}
          <button className="underline text-gold" onClick={async () => toast(await resendConfirmation())}>Resend link</button>
        </Card>
      )}
      {mode !== "forgot" && (
        <>
          <ProviderButtons onResult={(r) => toast(r)} />
          <div className="flex items-center gap-3 my-5 text-muted-fg text-xs"><div className="h-px bg-line flex-1" />or use email<div className="h-px bg-line flex-1" /></div>
        </>
      )}
      <form onSubmit={submit}>
        <Field id="email" label="EMAIL" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== "forgot" && (
          <Field id="password" label="PASSWORD" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : ""} />
        )}
        <button className="btn btn-pink w-full mt-2" disabled={busy}>
          {busy ? "One sec…" : mode === "signup" ? "Create account" : mode === "signin" ? "Sign in" : "Send reset link"}
        </button>
      </form>
      {notice && <p className="text-sm text-center mt-4" style={{ color: "var(--gold)" }}>{notice}</p>}
      <div className="text-center text-sm mt-6 space-y-3">
        {mode === "signup" && <p>Already have an account? <button className="underline text-electric" onClick={() => setMode("signin")}>Sign in</button></p>}
        {mode === "signin" && (
          <>
            <p><button className="underline text-electric" onClick={() => setMode("forgot")}>Forgot password?</button></p>
            <p>New here? <button className="underline text-electric" onClick={() => setMode("signup")}>Create an account</button></p>
          </>
        )}
        {mode === "forgot" && <p><button className="underline text-electric" onClick={() => setMode("signin")}>Back to sign in</button></p>}
        <p><Link to="/dashboard" className="text-muted-fg underline">Keep playing as a guest</Link></p>
      </div>
    </Shell>
  );
}

/** /auth/callback — web only: Supabase finishes OAuth / email confirmation from the URL. */
export function AuthCallback() {
  const nav = useNavigate();
  const session = useCloud((s) => s.session);
  const [slow, setSlow] = useState(false);
  useEffect(() => { if (session) nav("/account", { replace: true }); }, [session, nav]);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, []);
  return (
    <Shell title="SIGNING YOU IN">
      <p className="text-center font-pixel text-[10px] animate-press-start" style={{ color: "var(--gold)" }}>LOADING…</p>
      {slow && <p className="text-center text-sm text-muted-fg mt-6">Taking a while. <Link className="underline" to="/login?mode=signin">Try signing in again</Link>.</p>}
    </Shell>
  );
}

/** /reset-password — set a new password after following the email link. */
export function ResetPassword() {
  const nav = useNavigate();
  const session = useCloud((s) => s.session);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await updatePassword(pw);
    setBusy(false);
    toast({ ok: r.ok, message: r.message });
    if (r.ok) nav("/account", { replace: true });
  };
  return (
    <Shell title="NEW PASSWORD" sub="Choose a new password for your account.">
      {!session ? (
        <Card className="text-sm">This reset link has expired or was already used. <Link className="underline text-electric" to="/login?mode=signin">Request a new one</Link>.</Card>
      ) : (
        <form onSubmit={submit}>
          <Field id="new-password" label="NEW PASSWORD" type="password" autoComplete="new-password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
          <button className="btn btn-pink w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
        </form>
      )}
    </Shell>
  );
}
