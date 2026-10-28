// Shopify → TourStar: when a merch order is paid, record it and unlock the matching in-game items
// (Admin → Merch maps each product to stages, titles, badges, app colors or dance moves).
// Shopify signs each webhook with the app's secret; we check the signature before trusting anything.
// Set up in Shopify: Settings → Notifications → Webhooks → "Order payment", JSON, URL = this function.
// Paste the signing secret shown there into Admin → Integrations → "Shopify · webhook secret".
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function hmacOk(secret: string, raw: string, header: string | null) {
  if (!header) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const expected = btoa(String.fromCharCode(...sig));
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: secret } = await svc.rpc("get_secret", { p_name: "shopify_webhook_secret" });
  if (!secret) return json({ error: "Webhook secret not set." }, 503);
  if (!(await hmacOk(String(secret).trim(), raw, req.headers.get("x-shopify-hmac-sha256")))) return json({ error: "Bad signature." }, 401);

  const topic = req.headers.get("x-shopify-topic") ?? "";
  if (topic !== "orders/paid" && topic !== "orders/create") return json({ ignored: topic });
  let order: Record<string, unknown>;
  try { order = JSON.parse(raw); } catch { return json({ error: "Bad JSON." }, 400); }
  if (topic === "orders/create" && order.financial_status !== "paid") return json({ ignored: "not paid yet" });

  const { data, error } = await svc.rpc("merch_record_order", { p_order: order });
  if (error) { console.error("merch order failed", error.message); return json({ error: error.message }, 500); }
  console.log(`merch order ${order.name ?? order.id}: ${JSON.stringify(data)}`);
  return json({ ok: true, result: data });
});
