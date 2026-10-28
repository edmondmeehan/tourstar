// Admin-only: email someone who was just added as a TourStar admin (Admin → Admins → "Email them").
//   { email }  → sends one email through Resend, only if that address is an admin or has a pending admin invite.
// Deployed with verify_jwt = false; checks the caller is an admin itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://tourstarapp.com";
const ADDRESS = "TourStar, LLC · 1133 Broadway, #1301, New York, NY 10010";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function adminEmail(to: string, by: string, active: boolean) {
  const step = active
    ? `Sign in to TourStar with <b>${esc(to)}</b> and open the admin dashboard.`
    : `Create your TourStar account with <b>${esc(to)}</b> and confirm the email we send you. Admin access turns on as soon as you sign in.`;
  const stepText = active
    ? `Sign in to TourStar with ${to} and open the admin dashboard.`
    : `Create your TourStar account with ${to} and confirm the email we send you. Admin access turns on as soon as you sign in.`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#05040f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05040f;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0e0c24;border:1px solid #2a2650;border-radius:16px;">
<tr><td align="center" style="padding:28px 28px 8px;"><img src="${SITE}/brand/tourstar-logo.png" width="220" alt="TourStar" style="display:block;border:0;width:220px;max-width:100%;height:auto;"></td></tr>
<tr><td style="padding:8px 28px 28px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#e9e6ff;font-size:16px;line-height:1.55;">
<h1 style="margin:8px 0 12px;font-size:22px;line-height:1.25;color:#ffffff;">You're now a TourStar admin</h1>
<p style="margin:0 0 12px;">${esc(by)} added you as an admin on TourStar.</p>
<p style="margin:0 0 12px;">${step}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="background:#ff2e88;border-radius:10px;"><a href="${SITE}/admin" style="display:inline-block;padding:13px 22px;font-weight:700;color:#ffffff;text-decoration:none;font-size:15px;">Open the admin</a></td></tr></table>
<p style="margin:0 0 12px;color:#b9b5e0;font-size:14px;">Admins can see player saves and change live game settings, so keep your sign-in private. If you weren't expecting this, reply to this email and let us know.</p>
</td></tr></table>
<p style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#7d79a6;font-size:12px;line-height:1.6;margin:18px 0 0;max-width:520px;">Copyright © 2026 TourStar, LLC.<br>${esc(ADDRESS)}</p>
</td></tr></table></body></html>`;
  const text = `You're now a TourStar admin

${by} added you as an admin on TourStar.

${stepText}

Open the admin: ${SITE}/admin

Admins can see player saves and change live game settings, so keep your sign-in private. If you weren't expecting this, reply to this email and let us know.

Copyright © 2026 TourStar, LLC.
${ADDRESS}`;
  return { subject: "You're now a TourStar admin", html, text };
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

  const body = await req.json().catch(() => ({}));
  const to = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "Enter a valid email." }, 400);

  // Only email addresses that really are admins (or invited), so this can't be used to email anyone.
  const { data: list, error: listErr } = await asUser.rpc("admin_list");
  if (listErr) return json({ error: listErr.message }, 500);
  const row = (list as { email: string; status: string }[] | null)?.find((r) => r.email.toLowerCase() === to);
  if (!row) return json({ error: "That email isn't an admin or invited admin." }, 400);

  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: key } = await svc.rpc("get_secret", { p_name: "resend_api_key" });
  if (!key) return json({ error: "Add your Resend key in Integrations first." }, 503);
  const { data: cfg } = await svc.from("app_public_config").select("key, value").in("key", ["email_from", "email_reply_to"]);
  const conf = Object.fromEntries((cfg ?? []).map((x) => [x.key, String(x.value ?? "").trim()]));

  const mail = adminEmail(to, who.user.email ?? "A TourStar admin", row.status === "admin");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: conf.email_from || "TourStar <hello@tourstarapp.com>",
      reply_to: who.user.email || conf.email_reply_to || undefined,
      to: [to], subject: mail.subject, html: mail.html, text: mail.text,
    }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({})) as { message?: string };
    console.error("admin-notify failed", r.status, d.message);
    return json({ error: `Resend said: ${d.message ?? r.status}` }, 502);
  }
  return json({ ok: true });
});
