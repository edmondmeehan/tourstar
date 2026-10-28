// Admin: API keys for outside services.
// Public keys (safe in the app) → app_public_config. Secret keys → Supabase Vault (never sent back to the browser).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { askConfirm, toast } from "../components/ui";
import { Section, fail, input, when } from "./kit";

interface Def {
  name: string;
  label: string;
  what: string;
  prefix?: string;
  where: { text: string; url: string };
  kind: "public" | "secret";
  testable?: boolean;
}

const DEFS: Def[] = [
  { name: "revenuecat_ios_public", kind: "public", label: "RevenueCat · iOS public SDK key", prefix: "appl_", what: "Turns on real App Store purchases in the iPhone app. The app picks up changes on its next launch.", where: { text: "RevenueCat → Project settings → API keys", url: "https://app.revenuecat.com" } },
  { name: "revenuecat_android_public", kind: "public", label: "RevenueCat · Android public SDK key", prefix: "goog_", what: "Same, for Google Play purchases in the Android app.", where: { text: "RevenueCat → Project settings → API keys", url: "https://app.revenuecat.com" } },
  { name: "revenuecat_secret_key", kind: "secret", label: "RevenueCat · secret API key (v2)", prefix: "sk_", testable: true, what: "Lets the server read revenue, refunds and customers for the Finance tab.", where: { text: "RevenueCat → Project settings → API keys → New secret key (v2)", url: "https://app.revenuecat.com" } },
  { name: "revenuecat_webhook_secret", kind: "secret", label: "RevenueCat · webhook password", what: `Make up a long random password and save it here. In RevenueCat → Integrations → Webhooks, set the URL to ${import.meta.env.VITE_SUPABASE_URL ?? "<supabase>"}/functions/v1/revenuecat-webhook and paste the same password as the Authorization header. This records revenue for the Economy tab, VIP status and AI song packs.`, where: { text: "RevenueCat → Integrations → Webhooks", url: "https://app.revenuecat.com" } },
  { name: "apns_key_p8", kind: "secret", label: "Apple Push · key file (.p8)", what: "Lets TourStar send push notifications to iPhones. Open the .p8 file in TextEdit and paste everything, including the BEGIN and END lines.", where: { text: "developer.apple.com → Certificates, IDs & Profiles → Keys → + → Apple Push Notifications service (APNs)", url: "https://developer.apple.com/account/resources/authkeys/list" } },
  { name: "apns_key_id", kind: "secret", label: "Apple Push · Key ID", what: "The 10-character Key ID shown next to that key.", where: { text: "developer.apple.com → Keys", url: "https://developer.apple.com/account/resources/authkeys/list" } },
  { name: "apns_team_id", kind: "secret", label: "Apple Push · Team ID", what: "Your 10-character Apple Developer Team ID.", where: { text: "developer.apple.com → Membership details", url: "https://developer.apple.com/account" } },
  { name: "resend_api_key", kind: "secret", label: "Resend · API key", prefix: "re_", testable: true, what: "Sends emails from the game: prize and order updates, raffle winners, waitlist news.", where: { text: "resend.com → API Keys", url: "https://resend.com/api-keys" } },
  { name: "anthropic_api_key", kind: "secret", label: "Anthropic (Claude) · API key", prefix: "sk-ant-", testable: true, what: "Powers AI features: song titles and lyrics, gossip headlines, rival banter, artist bios.", where: { text: "console.anthropic.com → API Keys", url: "https://console.anthropic.com/settings/keys" } },
  { name: "elevenlabs_api_key", kind: "secret", label: "ElevenLabs · API key", testable: true, what: "AI audio: real songs for releases, Mo's voice and the stadium announcer. Switch each on in the AI audio tab.", where: { text: "elevenlabs.io → Profile → API keys", url: "https://elevenlabs.io/app/settings/api-keys" } },
  { name: "replicate_api_token", kind: "secret", label: "Replicate · API token", prefix: "r8_", testable: true, what: "Backup AI music and image models (album covers).", where: { text: "replicate.com → Account → API tokens", url: "https://replicate.com/account/api-tokens" } },
  { name: "openai_api_key", kind: "secret", label: "OpenAI · API key", prefix: "sk-", testable: true, what: "Optional alternative AI provider.", where: { text: "platform.openai.com → API keys", url: "https://platform.openai.com/api-keys" } },
];

interface SecretRow { name: string; last4: string; updated_at: string; last_test_ok: boolean | null; last_test_at: string | null; last_test_message: string | null }
interface PublicRow { key: string; value: string; updated_at: string }

const mask = (v: string) => (v.length <= 8 ? v : `${v.slice(0, 5)}…${v.slice(-4)}`);

export function IntegrationsTab() {
  const [secrets, setSecrets] = useState<Record<string, SecretRow>>({});
  const [publics, setPublics] = useState<Record<string, PublicRow>>({});
  const [loaded, setLoaded] = useState(false);
  const [custom, setCustom] = useState("");

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([supabase!.rpc("admin_list_secrets"), supabase!.from("app_public_config").select("key, value, updated_at")]);
    if (s.error) return fail(s.error);
    if (p.error) return fail(p.error);
    setSecrets(Object.fromEntries((s.data as SecretRow[]).map((r) => [r.name, r])));
    setPublics(Object.fromEntries((p.data as PublicRow[]).map((r) => [r.key, r])));
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const extra = Object.keys(secrets).filter((n) => !DEFS.some((d) => d.name === n)).map<Def>((name) => ({
    name, kind: "secret", label: name, what: "Custom key.", where: { text: "", url: "" },
  }));

  const addCustom = () => {
    const n = custom.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!/^[a-z0-9_]{3,60}$/.test(n)) return toast({ ok: false, message: "Use 3-60 letters, numbers or underscores, e.g. stripe_secret_key." });
    if (DEFS.some((d) => d.name === n) || secrets[n]) return toast({ ok: false, message: "That key already exists below." });
    setSecrets((s) => ({ ...s, [n]: { name: n, last4: "", updated_at: "", last_test_ok: null, last_test_at: null, last_test_message: null } }));
    setCustom("");
  };

  return (
    <>
      <div className="panel p-4 mb-5 text-xs leading-relaxed">
        <b>How keys are stored.</b> <span className="text-muted-fg">Public keys (RevenueCat's appl_/goog_ keys) are meant to be inside the app, so they're saved as plain settings the app reads on launch. Secret keys are encrypted in Supabase Vault. After saving, nobody, including admins, can view them again here; you'll only see the last 4 characters. Only server code can use them.</span>
      </div>
      {!loaded ? <p className="text-sm text-muted-fg">Loading…</p> : (
        <>
          <Section title="In-app purchases">
            {DEFS.filter((d) => d.name.startsWith("revenuecat")).map((d) => <KeyRow key={d.name} def={d} secret={secrets[d.name]} pub={publics[d.name]} onChange={load} />)}
          </Section>
          <Section title="Push notifications (iPhone)">
            {DEFS.filter((d) => d.name.startsWith("apns_")).map((d) => <KeyRow key={d.name} def={d} secret={secrets[d.name]} pub={publics[d.name]} onChange={load} />)}
          </Section>
          <Section title="Email">
            {DEFS.filter((d) => d.name === "resend_api_key").map((d) => <KeyRow key={d.name} def={d} secret={secrets[d.name]} pub={publics[d.name]} onChange={load} />)}
            <p className="text-[11px] text-muted-fg mt-2">Sign-up and password emails are sent by Supabase. To send those from Resend too, use the same key as the SMTP password in Supabase → Authentication → Emails → SMTP (host <code>smtp.resend.com</code>, port 465, user <code>resend</code>).</p>
          </Section>
          <Section title="AI">
            {DEFS.filter((d) => ["anthropic_api_key", "elevenlabs_api_key", "replicate_api_token", "openai_api_key"].includes(d.name)).map((d) => <KeyRow key={d.name} def={d} secret={secrets[d.name]} pub={publics[d.name]} onChange={load} />)}
          </Section>
          <Section title="Other keys" sub="Store any other secret for future server features (e.g. stripe_secret_key, slack_webhook_url).">
            {extra.map((d) => <KeyRow key={d.name} def={d} secret={secrets[d.name]?.last4 ? secrets[d.name] : undefined} onChange={load} />)}
            <div className="flex gap-2 mt-2">
              <input className={`${input} max-w-xs`} placeholder="key_name" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="New key name" />
              <button className="btn btn-ghost text-sm" onClick={addCustom}>+ Add key</button>
            </div>
          </Section>
        </>
      )}
    </>
  );
}

function KeyRow({ def, secret, pub, onChange }: { def: Def; secret?: SecretRow; pub?: PublicRow; onChange: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const isSet = def.kind === "public" ? !!pub?.value : !!secret?.last4;
  const shown = def.kind === "public" ? (pub?.value ? mask(pub.value) : "") : secret?.last4 ? `••••••••${secret.last4}` : "";
  const updated = def.kind === "public" ? pub?.updated_at : secret?.updated_at;
  const lastTest = test ?? (secret?.last_test_at ? { ok: !!secret.last_test_ok, message: secret.last_test_message ?? "" } : null);
  const prefixWarning = value && def.prefix && !value.trim().startsWith(def.prefix);

  const save = async () => {
    const v = value.trim();
    if (!v) return;
    setBusy("save");
    const { error } = def.kind === "public"
      ? await supabase!.from("app_public_config").upsert({ key: def.name, value: v, updated_at: new Date().toISOString() })
      : await supabase!.rpc("admin_set_secret", { p_name: def.name, p_value: v });
    setBusy(null);
    if (error) return fail(error);
    setValue("");
    setTest(null);
    toast({ ok: true, message: def.kind === "public" ? "Saved. The app uses it on next launch." : "Saved to the vault." });
    onChange();
    if (def.testable && def.kind === "secret") void runTest();
  };

  const runTest = async () => {
    setBusy("test");
    const { data, error } = await supabase!.functions.invoke("integration-test", { body: { name: def.name } });
    setBusy(null);
    if (error) return setTest({ ok: false, message: "The test service isn't deployed yet." });
    setTest(data as { ok: boolean; message: string });
  };

  const remove = () => askConfirm(`Remove the ${def.label}? Features that use it stop working until you add a new one.`, async () => {
    setBusy("remove");
    const { error } = def.kind === "public"
      ? await supabase!.from("app_public_config").delete().eq("key", def.name)
      : await supabase!.rpc("admin_delete_secret", { p_name: def.name });
    setBusy(null);
    if (error) return fail(error);
    setTest(null);
    onChange();
  }, { yes: "Remove", danger: true });

  return (
    <div className="py-4 border-b border-line/60 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm flex items-center gap-2">
            {def.label}
            <span className={`text-[10px] px-2 py-0.5 rounded border font-normal ${isSet ? "text-success border-success" : "text-muted-fg border-line"}`}>{isSet ? "CONNECTED" : "NOT SET"}</span>
            {def.kind === "secret" ? <span className="text-[10px] text-muted-fg font-normal">🔒 secret</span> : <span className="text-[10px] text-muted-fg font-normal">public</span>}
          </div>
          <div className="text-xs text-muted-fg mt-1 max-w-prose">{def.what}{def.where.url && <> Get it: <a className="underline" href={def.where.url} target="_blank" rel="noreferrer">{def.where.text}</a>.</>}</div>
          {isSet && <div className="text-xs mt-1"><code className="text-fg">{shown}</code> <span className="text-muted-fg">· updated {when(updated ?? null)}</span></div>}
          {lastTest && <div className="text-xs mt-1" style={{ color: lastTest.ok ? "var(--success)" : "var(--danger)" }}>{lastTest.ok ? "✓" : "✕"} {lastTest.message}</div>}
        </div>
        <div className="flex gap-3 text-xs">
          {isSet && def.testable && def.kind === "secret" && <button className="underline" disabled={busy !== null} onClick={() => void runTest()}>{busy === "test" ? "Testing…" : "Test"}</button>}
          {isSet && <button className="underline text-danger" disabled={busy !== null} onClick={remove}>Remove</button>}
        </div>
      </div>
      <div className="flex gap-2 mt-3 max-w-xl">
        <input className={input} type={def.kind === "secret" ? "password" : "text"} autoComplete="off" spellCheck={false}
          placeholder={isSet ? "Paste a new key to replace it" : `Paste the key${def.prefix ? ` (starts with ${def.prefix})` : ""}`}
          value={value} onChange={(e) => setValue(e.target.value)} aria-label={def.label} />
        <button className="btn btn-pink text-sm" disabled={!value.trim() || busy !== null} onClick={() => void save()}>{busy === "save" ? "Saving…" : isSet ? "Replace" : "Save"}</button>
      </div>
      {prefixWarning && <div className="text-[11px] mt-1" style={{ color: "var(--gold)" }}>Heads up: this key usually starts with "{def.prefix}". Double-check you copied the right one.</div>}
    </div>
  );
}
