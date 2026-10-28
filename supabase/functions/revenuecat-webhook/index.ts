// RevenueCat → TourStar. RevenueCat calls this on every App Store / Google Play purchase event.
//  • Records revenue for Admin → Economy (revenue per player).
//  • Keeps TourStar VIP status on the server (more AI songs per day).
//  • Adds AI Studio credits when a player buys a song pack.
// Setup: RevenueCat → Project → Integrations → Webhooks → URL = <this function's URL>,
// Authorization header = the value saved in Admin → Integrations → "revenuecat_webhook_secret".
// Deployed with verify_jwt = false; it checks that Authorization header itself.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const AI_PACKS: Record<string, number> = { ai_songs_5: 5, ai_songs_15: 15 };
const VIP_PRODUCTS = ["vip_monthly", "vip_yearly"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sku = (productId: string | undefined) => (productId ?? "").replace(/^co\.please\.tourstar\./, "").replace(/:.*$/, "");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: secret } = await svc.rpc("get_secret", { p_name: "revenuecat_webhook_secret" });
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || auth !== secret) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const e = body?.event;
  if (!e?.id || !e?.type) return new Response("Bad request", { status: 400 });

  const uid = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])].find((x: unknown) => typeof x === "string" && UUID.test(x)) ?? null;
  const product = sku(e.product_id);
  const at = e.purchased_at_ms ? new Date(e.purchased_at_ms).toISOString() : new Date(e.event_timestamp_ms ?? Date.now()).toISOString();

  // Record once (RevenueCat retries; the event id makes this idempotent).
  const { data: inserted, error } = await svc.from("revenue_events").upsert({
    id: String(e.id), user_id: uid, type: String(e.type), product_id: product || null,
    price_usd: typeof e.price === "number" ? e.price : 0, environment: e.environment ?? null, at, raw: e,
  }, { onConflict: "id", ignoreDuplicates: true }).select("id");
  if (error) {
    // A user id that isn't a TourStar account (yet): record without it.
    if (/foreign key/i.test(error.message)) {
      await svc.from("revenue_events").upsert({ id: String(e.id), user_id: null, type: String(e.type), product_id: product || null, price_usd: typeof e.price === "number" ? e.price : 0, environment: e.environment ?? null, at, raw: e }, { onConflict: "id", ignoreDuplicates: true });
      return new Response("ok");
    }
    console.error("revenue_events", error.message);
    return new Response("error", { status: 500 });
  }
  if (!inserted?.length || !uid) return new Response("ok"); // duplicate, or no TourStar account to credit

  // AI Studio packs → credits.
  const credits = AI_PACKS[product];
  if (credits && e.type === "NON_RENEWING_PURCHASE") {
    const { data: cur } = await svc.from("player_perks").select("ai_credits").eq("user_id", uid).maybeSingle();
    await svc.from("player_perks").upsert({ user_id: uid, ai_credits: (cur?.ai_credits ?? 0) + credits, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }

  // VIP subscription → keep the expiry date in sync.
  if (VIP_PRODUCTS.includes(product) && e.expiration_at_ms) {
    if (["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "EXPIRATION", "BILLING_ISSUE", "SUBSCRIPTION_EXTENDED"].includes(e.type)) {
      await svc.from("player_perks").upsert({ user_id: uid, vip_until: new Date(e.expiration_at_ms).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    }
  }
  return new Response("ok");
});
