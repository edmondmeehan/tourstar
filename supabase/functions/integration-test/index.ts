// Admin-only: checks that an integration key stored in Vault actually works, without ever
// returning the key. Called from /admin → Integrations → Test.
// Deployed with verify_jwt = false because it verifies the caller (and that they're an admin) itself.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Check = (key: string) => Promise<{ ok: boolean; message: string }>;

async function call(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* not json */ }
  return { status: res.status, body: body as Record<string, unknown> | null };
}
const errText = (b: Record<string, unknown> | null) => {
  const e = b?.error ?? b?.message ?? b?.detail;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in (e as Record<string, unknown>)) return String((e as Record<string, unknown>).message);
  return "";
};

const CHECKS: Record<string, Check> = {
  anthropic_api_key: async (k) => {
    const r = await call("https://api.anthropic.com/v1/models?limit=1", { "x-api-key": k, "anthropic-version": "2023-06-01" });
    return r.status === 200 ? { ok: true, message: "Connected to Anthropic." } : { ok: false, message: `Anthropic said ${r.status}: ${errText(r.body) || "invalid key"}` };
  },
  openai_api_key: async (k) => {
    const r = await call("https://api.openai.com/v1/models", { Authorization: `Bearer ${k}` });
    return r.status === 200 ? { ok: true, message: "Connected to OpenAI." } : { ok: false, message: `OpenAI said ${r.status}: ${errText(r.body) || "invalid key"}` };
  },
  resend_api_key: async (k) => {
    const r = await call("https://api.resend.com/domains", { Authorization: `Bearer ${k}` });
    if (r.status === 200) {
      const domains = ((r.body?.data as { name: string; status: string }[]) ?? []).map((d) => `${d.name} (${d.status})`);
      return { ok: true, message: domains.length ? `Connected to Resend. Domains: ${domains.join(", ")}` : "Connected to Resend. Add and verify a sending domain next." };
    }
    // Sending-only keys can't list domains but are valid.
    if (r.status === 401 && /restricted/i.test(JSON.stringify(r.body))) return { ok: true, message: "Valid Resend key (sending access only)." };
    return { ok: false, message: `Resend said ${r.status}: ${errText(r.body) || "invalid key"}` };
  },
  elevenlabs_api_key: async (k) => {
    const r = await call("https://api.elevenlabs.io/v1/user/subscription", { "xi-api-key": k });
    if (r.status === 200) return { ok: true, message: `Connected to ElevenLabs (${r.body?.tier ?? "plan"}, ${r.body?.character_count ?? 0}/${r.body?.character_limit ?? "?"} characters used).` };
    return { ok: false, message: `ElevenLabs said ${r.status}: ${errText(r.body) || "invalid key"}` };
  },
  replicate_api_token: async (k) => {
    const r = await call("https://api.replicate.com/v1/account", { Authorization: `Bearer ${k}` });
    return r.status === 200 ? { ok: true, message: `Connected to Replicate as ${r.body?.username ?? "your account"}.` } : { ok: false, message: `Replicate said ${r.status}: ${errText(r.body) || "invalid token"}` };
  },
  revenuecat_secret_key: async (k) => {
    const r = await call("https://api.revenuecat.com/v2/projects", { Authorization: `Bearer ${k}` });
    if (r.status === 200) {
      const names = ((r.body?.items as { name: string }[]) ?? []).map((p) => p.name);
      return { ok: true, message: `Connected to RevenueCat${names.length ? ` (${names.join(", ")})` : ""}.` };
    }
    return { ok: false, message: `RevenueCat said ${r.status}: ${errText(r.body) || "invalid key (use a v2 secret key)"}` };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;

  // Is the caller an admin? Ask the database as the caller.
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isAdmin } = await asUser.rpc("is_admin");
  if (!isAdmin) return json({ error: "Admins only" }, 403);

  const { name } = await req.json().catch(() => ({ name: "" }));
  const check = CHECKS[name];
  if (!check) return json({ ok: false, message: "No automatic test for this key yet." });

  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: key, error } = await svc.rpc("get_secret", { p_name: name });
  if (error) return json({ ok: false, message: "Couldn't read the key from the vault." }, 500);
  if (!key) return json({ ok: false, message: "No key saved yet." });

  let result: { ok: boolean; message: string };
  try {
    result = await check(key as string);
  } catch (e) {
    result = { ok: false, message: `Couldn't reach the service: ${(e as Error).message}` };
  }
  await svc.rpc("record_secret_test", { p_name: name, p_ok: result.ok, p_message: result.message });
  return json(result);
});
