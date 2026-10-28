// Public: join the tourstarapp.com waitlist (with referral codes) and send the welcome email.
// Called by the splash page. Deployed with verify_jwt = false (anyone can join).
// The welcome email goes out only when Admin → Beta signups → Emails → "Welcome email" is on and a
// Resend key is saved in Integrations. Someone already on the list gets their invite link re-sent
// (at most once an hour) instead of seeing it on screen, so nobody can look up another person's link.
import { createClient } from "npm:@supabase/supabase-js@2";
import { resend, unsubHeaders, welcomeEmail } from "./email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({}));

  const { data: r, error } = await svc.rpc("waitlist_join_service", {
    p_email: String(body.email ?? ""),
    p_source: body.source ? String(body.source) : null,
    p_referrer: body.referrer ? String(body.referrer) : null,
    p_ref: body.ref ? String(body.ref) : null,
  });
  if (error) return json({ error: error.message.includes("valid email") ? "Enter a valid email." : "Something went wrong. Try again." }, 400);

  // Welcome email (new signups), or re-send the invite link to someone already on the list.
  // `email` explains what happened (shown in the function logs and returned to the page for debugging).
  let emailed = false;
  let email = "not tried";
  const recent = r.welcome_sent_at && Date.now() - Date.parse(r.welcome_sent_at) < 3600_000;
  if (r.unsubscribed) email = "skipped: unsubscribed";
  else if (recent) email = "skipped: already sent within the last hour";
  else {
    const { data: cfg, error: cfgErr } = await svc.from("app_public_config").select("key, value").in("key", ["waitlist_welcome_enabled", "email_from", "email_reply_to"]);
    const conf = Object.fromEntries((cfg ?? []).map((x) => [x.key, String(x.value ?? "").trim()]));
    if (cfgErr) email = `skipped: config error ${cfgErr.message}`;
    else if (conf.waitlist_welcome_enabled !== "true") email = "skipped: welcome email is switched off";
    else {
      const { data: key, error: keyErr } = await svc.rpc("get_secret", { p_name: "resend_api_key" });
      if (!key) email = `skipped: no Resend key${keyErr ? ` (${keyErr.message})` : ""}`;
      else {
        try {
          const mail = welcomeEmail({ code: r.code, unsub: r.unsub, position: r.position, referrals: r.referrals });
          const sent = await resend("/emails", key as string, {
            from: conf.email_from || "TourStar <hello@tourstarapp.com>",
            reply_to: conf.email_reply_to || undefined,
            to: [r.email], subject: mail.subject, html: mail.html, text: mail.text,
            headers: unsubHeaders(r.unsub),
          });
          emailed = true;
          email = `sent (${(sent as { id?: string } | null)?.id ?? "no id"})`;
          const u = await svc.from("waitlist").update({ welcome_sent_at: new Date().toISOString() }).eq("id", r.id);
          if (u.error) email += `; couldn't record it: ${u.error.message}`;
          await svc.from("waitlist_emails").upsert({ waitlist_id: r.id, campaign: "welcome" }, { onConflict: "waitlist_id,campaign", ignoreDuplicates: true });
        } catch (e) {
          email = `failed: ${(e as Error).message}`;
        }
      }
    }
  }
  console.log(`waitlist join (${r.new ? "new" : "existing"}): welcome email ${email}`);

  if (!r.new) return json({ existing: true, emailed, email, total: r.total });
  return json({ code: r.code, position: r.position, referrals: r.referrals, total: r.total, emailed, email });
});
