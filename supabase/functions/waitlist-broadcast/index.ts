// Admin-only: send an announcement (e.g. "TourStar is live") to everyone on the waitlist.
//   { action: "test", campaign }            → sends one copy to the signed-in admin
//   { action: "send", id, campaign }        → sends the next batch (up to 300) and returns what's left;
//                                             the admin screen calls it repeatedly until remaining = 0.
// Each person gets each campaign at most once (waitlist_emails), and unsubscribed people are skipped.
// Deployed with verify_jwt = false because it checks the caller is an admin itself.
import { createClient } from "npm:@supabase/supabase-js@2";
import { campaignEmail, resend, unsubHeaders, type Campaign } from "./email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const clean = (c: Record<string, unknown>): Campaign => ({
  subject: String(c.subject ?? "").trim().slice(0, 150),
  heading: c.heading ? String(c.heading).trim().slice(0, 150) : null,
  message: c.message ? String(c.message).slice(0, 5000) : null,
  cta_label: c.cta_label ? String(c.cta_label).trim().slice(0, 60) : null,
  cta_url: c.cta_url && /^https:\/\//.test(String(c.cta_url)) ? String(c.cta_url).trim().slice(0, 500) : null,
});

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
  const body = await req.json().catch(() => ({}));
  const c = clean(body.campaign ?? {});
  if (!c.subject) return json({ error: "Add a subject line." }, 400);

  const { data: key } = await svc.rpc("get_secret", { p_name: "resend_api_key" });
  if (!key) return json({ error: "Add your Resend key in Integrations first." }, 503);
  const { data: cfg } = await svc.from("app_public_config").select("key, value").in("key", ["email_from", "email_reply_to"]);
  const conf = Object.fromEntries((cfg ?? []).map((x) => [x.key, x.value]));
  const from = conf.email_from || "TourStar <hello@tourstarapp.com>";
  const reply_to = conf.email_reply_to || undefined;

  try {
    if (body.action === "test") {
      // Use the admin's own waitlist row if they have one, otherwise a sample.
      const { data: me } = await svc.from("waitlist").select("ref_code, unsub_token, referral_count").ilike("email", who.user.email!).maybeSingle();
      const mail = campaignEmail(c, { code: me?.ref_code ?? "sample1", unsub: me?.unsub_token ?? "00000000-0000-0000-0000-000000000000", position: 1, referrals: me?.referral_count ?? 0 });
      await resend("/emails", key as string, { from, reply_to, to: [who.user.email], subject: `[TEST] ${mail.subject}`, html: mail.html, text: mail.text });
      return json({ ok: true, to: who.user.email });
    }

    if (body.action === "send") {
      const id = String(body.id ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 80);
      if (!id) return json({ error: "Missing campaign id." }, 400);
      await svc.from("email_campaigns").upsert({ id, ...c }, { onConflict: "id" });

      const { data: rows, error } = await svc.rpc("waitlist_batch", { p_campaign: id, p_limit: 300 });
      if (error) throw error;
      let sent = 0;
      for (let i = 0; i < (rows ?? []).length; i += 100) {
        const chunk = rows!.slice(i, i + 100);
        await resend("/emails/batch", key as string, chunk.map((r: { email: string; ref_code: string; unsub_token: string; referral_count: number; pos: number }) => {
          const mail = campaignEmail(c, { code: r.ref_code, unsub: r.unsub_token, position: r.pos, referrals: r.referral_count });
          return { from, reply_to, to: [r.email], subject: mail.subject, html: mail.html, text: mail.text, headers: unsubHeaders(r.unsub_token) };
        }));
        await svc.from("waitlist_emails").upsert(chunk.map((r: { id: string }) => ({ waitlist_id: r.id, campaign: id })), { onConflict: "waitlist_id,campaign", ignoreDuplicates: true });
        sent += chunk.length;
      }
      const { data: remaining } = await svc.rpc("waitlist_campaign_remaining", { p_campaign: id });
      if (remaining === 0) await svc.from("email_campaigns").update({ finished_at: new Date().toISOString() }).eq("id", id);
      return json({ sent, remaining: remaining ?? 0 });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error("broadcast failed", err.message);
    const hint = err.status === 403 || /domain/i.test(err.message ?? "") ? " Check that the sender's domain is verified in Resend." : "";
    return json({ error: `Resend said: ${err.message ?? "error"}.${hint}` }, 502);
  }
});
