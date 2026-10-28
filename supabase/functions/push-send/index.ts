// Admin-only: send a push notification to players' iPhones (Apple Push Notification service).
//   { title, body, link?, audience: "all" | "vip" | "inactive" | "presale" | "test", presale_id? }
// Needs three keys in Admin → Integrations: apns_key_p8 (the .p8 file's contents), apns_key_id, apns_team_id.
// Tokens Apple says are dead are removed. Deployed with verify_jwt = false; checks for an admin itself.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUNDLE_ID = "co.please.tourstar";
const HOSTS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" } as const;
const LINKS = ["/dashboard", "/store", "/store?tab=drops", "/presales", "/premium", "/tour", "/album"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Apple's provider token: an ES256 JWT signed with the .p8 key (valid up to an hour). */
async function apnsJwt(p8: string, keyId: string, teamId: string) {
  const pem = p8.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid: keyId })));
  const claims = b64url(enc.encode(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64url(sig)}`;
}

async function sendOne(jwt: string, env: "production" | "sandbox", token: string, payload: unknown) {
  const r = await fetch(`${HOSTS[env]}/3/device/${token}`, {
    method: "POST",
    headers: { authorization: `bearer ${jwt}`, "apns-topic": BUNDLE_ID, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (r.status === 200) return { ok: true as const };
  const reason = ((await r.json().catch(() => ({}))) as { reason?: string }).reason ?? `HTTP ${r.status}`;
  return { ok: false as const, status: r.status, reason };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who } = await asUser.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  const { data: isAdmin } = await asUser.rpc("is_admin");
  if (!who?.user || isAdmin !== true) return json({ error: "Admins only." }, 403);
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? "").trim().slice(0, 80);
  const body = String(b.body ?? "").trim().slice(0, 240);
  const audience = ["all", "vip", "inactive", "presale", "test"].includes(b.audience) ? b.audience : null;
  const link = LINKS.includes(b.link) ? b.link : "/dashboard";
  const presaleId = audience === "presale" ? String(b.presale_id ?? "") || null : null;
  if (!title || !body || !audience) return json({ error: "Add a title, a message and who it goes to." }, 400);
  if (audience === "presale" && !presaleId) return json({ error: "Pick the presale." }, 400);

  const keys = await Promise.all(["apns_key_p8", "apns_key_id", "apns_team_id"].map((n) => svc.rpc("get_secret", { p_name: n }).then((r) => r.data as string | null)));
  if (keys.some((k) => !k)) return json({ error: "Push isn't set up yet. Add apns_key_p8, apns_key_id and apns_team_id in Admin → Integrations." }, 503);
  let jwt: string;
  try { jwt = await apnsJwt(keys[0]!, keys[1]!.trim(), keys[2]!.trim()); }
  catch { return json({ error: "The Apple push key (apns_key_p8) couldn't be read. Paste the whole .p8 file, including the BEGIN/END lines." }, 400); }

  const { data: devices, error } = await svc.rpc("push_audience", { p_audience: audience, p_presale: presaleId, p_admin: who.user.id });
  if (error) return json({ error: error.message }, 500);
  const ios = (devices ?? []).filter((d: { platform: string }) => d.platform === "ios") as { token: string; apns_env: string | null }[];

  const { data: msg } = await svc.from("push_messages").insert({ title, body, link, audience, presale_id: presaleId, devices: ios.length, created_by: who.user.id }).select("id").single();
  const payload = { aps: { alert: { title, body }, sound: "default" }, link };

  let delivered = 0, failed = 0;
  const dead: string[] = [];
  const envFix: { token: string; env: string }[] = [];
  const reasons: Record<string, number> = {};
  // Send in small parallel batches.
  for (let i = 0; i < ios.length; i += 50) {
    await Promise.all(ios.slice(i, i + 50).map(async (d) => {
      const first = (d.apns_env === "sandbox" ? "sandbox" : "production") as "production" | "sandbox";
      let r = await sendOne(jwt, first, d.token, payload);
      // Development (Xcode) builds use Apple's sandbox; try it once if production says the token is wrong.
      if (!r.ok && r.reason === "BadDeviceToken" && !d.apns_env) {
        const r2 = await sendOne(jwt, "sandbox", d.token, payload);
        if (r2.ok) envFix.push({ token: d.token, env: "sandbox" });
        r = r2;
      }
      if (r.ok) { delivered++; if (!d.apns_env && first === "production") envFix.push({ token: d.token, env: "production" }); return; }
      failed++;
      reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      if (r.status === 410 || r.reason === "Unregistered" || r.reason === "BadDeviceToken") dead.push(d.token);
    }));
  }
  if (dead.length) await svc.from("push_devices").delete().in("token", dead);
  for (const f of envFix) await svc.from("push_devices").update({ apns_env: f.env }).eq("token", f.token);
  if (msg?.id) await svc.from("push_messages").update({ sent_at: new Date().toISOString(), delivered, failed }).eq("id", msg.id);
  if (audience === "presale" && presaleId) await svc.from("presales").update({ notified_at: new Date().toISOString() }).eq("id", presaleId);

  const authError = reasons.InvalidProviderToken || reasons.ExpiredProviderToken;
  return json({
    devices: ios.length, delivered, failed, removed: dead.length, reasons,
    hint: authError ? "Apple rejected the push key. Check apns_key_id and apns_team_id match the .p8 key." : undefined,
  });
});
