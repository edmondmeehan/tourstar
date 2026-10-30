// Daily jobs: the admin report email and win-back emails for players who stopped playing.
//   Cron (pg_cron → pg_net, header x-cron-secret): runs both, if switched on in the admin.
//   Hourly cron ({ job: "hourly" }): closes finished league weeks and pushes "you were knocked out of the
//   promotion spots" alerts (switch: admin_settings.league_push.enabled, on unless turned off).
//   Admin (signed in): { action: "test_report" } emails the report to the caller now;
//                      { action: "test_winback", stage } emails the caller a sample win-back email.
// Deployed with verify_jwt = false: the cron call has no user JWT; both paths check their own credentials.
import { createClient } from "npm:@supabase/supabase-js@2";
import { pushToUser } from "./apns.ts";

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
const n = (v: unknown) => Number(v ?? 0) || 0;
const fmt = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function shell(inner: string, preheader: string, footer: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark light"></head>
<body style="margin:0;padding:0;background:#05040f;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05040f;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0e0c24;border:1px solid #2a2650;border-radius:16px;">
<tr><td align="center" style="padding:24px 28px 4px;"><a href="${SITE}"><img src="${SITE}/brand/tourstar-logo.png" width="190" alt="TourStar" style="display:block;border:0;width:190px;max-width:100%;height:auto;"></a></td></tr>
<tr><td style="padding:8px 28px 28px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#e9e6ff;font-size:16px;line-height:1.55;">${inner}</td></tr>
</table>
<p style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#7d79a6;font-size:12px;line-height:1.6;margin:18px 0 0;max-width:560px;">${footer}<br>Copyright © 2026 TourStar, LLC. ${esc(ADDRESS)}</p>
</td></tr></table></body></html>`;
}
const button = (label: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="background:#ff2e88;border-radius:10px;"><a href="${esc(url)}" style="display:inline-block;padding:13px 22px;font-weight:700;color:#ffffff;text-decoration:none;font-size:15px;">${esc(label)}</a></td></tr></table>`;

// ------------------------------------------------------------------ admin report

function delta(now: number, prev: number) {
  if (!prev && !now) return "";
  if (!prev) return ` <span style="color:#3ddc97;font-size:12px;">new</span>`;
  const p = Math.round(((now - prev) / prev) * 100);
  return ` <span style="color:${p >= 0 ? "#3ddc97" : "#ff6b81"};font-size:12px;">${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}%</span>`;
}

function reportEmail(d: Record<string, unknown>, day: string) {
  const row = (label: string, value: string, extra = "") =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #22204a;color:#b9b5e0;font-size:14px;">${esc(label)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #22204a;font-size:15px;font-weight:700;color:#fff;">${value}${extra}</td></tr>`;
  const section = (title: string, rows: string) =>
    `<p style="margin:22px 0 4px;font-size:12px;letter-spacing:1px;color:#ff42d8;font-weight:700;">${esc(title)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
  const top = (d.top as { artist: string; fame: number }[] | undefined) ?? [];
  const alerts: string[] = [];
  if (n(d.redemptions_pending)) alerts.push(`${fmt(n(d.redemptions_pending))} reward order${n(d.redemptions_pending) === 1 ? "" : "s"} waiting for review`);
  if (n(d.radio_reports)) alerts.push(`${fmt(n(d.radio_reports))} new radio report${n(d.radio_reports) === 1 ? "" : "s"}`);
  if (n(d.flagged)) alerts.push(`${fmt(n(d.flagged))} save${n(d.flagged) === 1 ? "" : "s"} flagged for possible cheating`);
  if (n(d.refunds)) alerts.push(`${fmt(n(d.refunds))} cancellation${n(d.refunds) === 1 ? "" : "s"} or refund${n(d.refunds) === 1 ? "" : "s"}`);
  const pressCost = (n(d.press_tokens) / 1e6) * 0.3;
  const inner = `
<h1 style="margin:6px 0 2px;font-size:22px;color:#fff;">Your TourStar day</h1>
<p style="margin:0;color:#b9b5e0;font-size:14px;">Last 24 hours, ${esc(day)}. Arrows compare with the day before.</p>
${alerts.length ? `<div style="background:#2a1630;border:1px solid #ff42d8;border-radius:10px;padding:12px 14px;margin:18px 0 0;font-size:14px;"><b style="color:#ffd23f;">Needs a look:</b><br>${alerts.map(esc).join("<br>")}</div>` : ""}
${section("PLAYERS", [
    row("New accounts", fmt(n(d.signups)), delta(n(d.signups), n(d.signups_prev))),
    row("Played today", fmt(n(d.active)), delta(n(d.active), n(d.active_prev))),
    row("Played this week", fmt(n(d.active_7d))),
    row("All players", fmt(n(d.players_total))),
    row("Waitlist signups", fmt(n(d.waitlist)), ` <span style="color:#7d79a6;font-size:12px;">${fmt(n(d.waitlist_total))} total</span>`),
  ].join(""))}
${section("MONEY", [
    row("App Store sales (before Apple's cut)", usd(n(d.revenue)), delta(n(d.revenue), n(d.revenue_prev))),
    row("Purchases", fmt(n(d.purchases))),
    row("Active VIP members", fmt(n(d.vip_active))),
    row("Merch orders", `${fmt(n(d.merch_orders))} · ${usd(n(d.merch_revenue))}`),
    row("Gold spent on drops", fmt(n(d.gold_spent))),
  ].join(""))}
${section("CONTENT", [
    row("AI songs recorded", fmt(n(d.ai_songs))),
    row("Press stories written", fmt(n(d.press)), ` <span style="color:#7d79a6;font-size:12px;">~${usd(pressCost)}</span>`),
  ].join(""))}
${top.length ? section("TOP ARTISTS (ALL-TIME FAME)", top.map((t, i) => row(`${i + 1}. ${t.artist}`, fmt(n(t.fame)))).join("")) : ""}
${button("Open the admin", `${SITE}/admin`)}`;
  const text = `Your TourStar day (last 24 hours, ${day})
${alerts.length ? `Needs a look: ${alerts.join("; ")}\n` : ""}
New accounts: ${n(d.signups)} (day before: ${n(d.signups_prev)})
Played today: ${n(d.active)} · this week: ${n(d.active_7d)} · all players: ${n(d.players_total)}
Waitlist signups: ${n(d.waitlist)} (${n(d.waitlist_total)} total)
App Store sales: ${usd(n(d.revenue))} (day before: ${usd(n(d.revenue_prev))}) · purchases: ${n(d.purchases)} · VIP: ${n(d.vip_active)}
Merch: ${n(d.merch_orders)} orders, ${usd(n(d.merch_revenue))} · Gold spent: ${n(d.gold_spent)}
AI songs: ${n(d.ai_songs)} · Press stories: ${n(d.press)}

Admin: ${SITE}/admin`;
  return {
    subject: `TourStar today: ${fmt(n(d.signups))} new, ${fmt(n(d.active))} played, ${usd(n(d.revenue))}`,
    html: shell(inner, `${n(d.signups)} new players, ${n(d.active)} played, ${usd(n(d.revenue))} in sales.`, "You're getting this because you turned on the daily report in the TourStar admin. Turn it off there anytime."),
    text,
  };
}

// ------------------------------------------------------------------ win-back

const STAGES: Record<number, { subject: (a: string) => string; heading: (a: string) => string; body: (a: string, s: Snap) => string; cta: string }> = {
  1: {
    subject: (a) => `${a}'s crowd is waiting`,
    heading: (a) => `The crowd is chanting "${a}"`,
    body: (a, s) => `Your energy is full and the next stage is open. ${a} has ${fmt(s.fans)} fans and ${fmt(s.fame)} fame so far. One show today keeps the hype up${s.streak > 1 ? ` and gets your ${s.streak}-day streak going again` : ""}.`,
    cta: "Play a show",
  },
  2: {
    subject: (a) => `${a}'s hype is fading`,
    heading: () => "Your hype is cooling off",
    body: (a, s) => `It's been a week. Hype fades while you're away, and ${a}'s rivals are booking your stages. You're level ${s.level}${s.levelName ? `, ${s.levelName}` : ""}; a couple of shows gets you back on the charts. Your royalties have been piling up too.`,
    cta: "Get back on stage",
  },
  3: {
    subject: (a) => `Is ${a} breaking up?`,
    heading: () => "The press is asking where you went",
    body: (a, s) => `Two weeks off the road and the tabloids are asking questions. ${fmt(s.fans)} fans are still waiting for ${a}'s next move. Drop a single, play one show, and remind everyone who you are.`,
    cta: "Make a comeback",
  },
};
interface Snap { fans: number; fame: number; level: number; levelName: string; streak: number }
function snap(career: Record<string, unknown> | null): Snap {
  const st = (career?.stats ?? {}) as Record<string, unknown>;
  const daily = (career?.daily ?? {}) as Record<string, unknown>;
  return { fans: n(st.fans), fame: n(st.fame), level: n(career?.peakLevel) || 1, levelName: "", streak: n(daily.streak) };
}
function winbackEmail(stage: number, artist: string, s: Snap, token: string, playUrl: string) {
  const t = STAGES[stage] ?? STAGES[1];
  const unsub = `${SITE}/?stop=${token}`;
  const inner = `
<h1 style="margin:8px 0 12px;font-size:24px;line-height:1.25;color:#ffffff;">${esc(t.heading(artist))}</h1>
<p style="margin:0 0 12px;">${esc(t.body(artist, s))}</p>
${button(t.cta, playUrl)}
<p style="margin:0;color:#b9b5e0;">See you on stage,<br>The TourStar crew</p>`;
  return {
    subject: t.subject(artist),
    html: shell(inner, t.body(artist, s).slice(0, 110), `You're getting this because you have a TourStar account. <a href="${unsub}" style="color:#7d79a6;">Stop these reminders</a> · <a href="${SITE}/privacy" style="color:#7d79a6;">Privacy</a>`),
    text: `${t.heading(artist)}\n\n${t.body(artist, s)}\n\n${t.cta}: ${playUrl}\n\nStop these reminders: ${unsub}\n${ADDRESS}`,
    unsub,
  };
}

// ------------------------------------------------------------------ send

async function send(key: string, from: string, replyTo: string | undefined, to: string, mail: { subject: string; html: string; text: string; unsub?: string }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, reply_to: replyTo, to: [to], subject: mail.subject, html: mail.html, text: mail.text,
      ...(mail.unsub ? { headers: { "List-Unsubscribe": `<${mail.unsub}>` } } : {}),
    }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({})) as { message?: string };
    return d.message ?? String(r.status);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({})) as { action?: string; stage?: number; job?: string };

  // Who is calling: the cron job (secret header) or a signed-in admin.
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  let fromCron = false;
  let caller: { id: string; email: string } | null = null;
  if (cronHeader) {
    const { data: ok } = await svc.rpc("cron_secret_ok", { p: cronHeader });
    if (ok !== true) return json({ error: "Forbidden" }, 403);
    fromCron = true;
  } else {
    const auth = req.headers.get("Authorization") ?? "";
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: who } = await asUser.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const { data: isAdmin } = await asUser.rpc("is_admin");
    if (!who?.user?.email || isAdmin !== true) return json({ error: "Admins only." }, 403);
    caller = { id: who.user.id, email: who.user.email };
  }

  // ---- Hourly: leagues
  if (fromCron && body.job === "hourly") {
    await svc.rpc("league_settle");
    const { data: sw } = await svc.from("admin_settings").select("value").eq("key", "league_push").maybeSingle();
    if ((sw?.value as { enabled?: boolean } | null)?.enabled === false) return json({ ok: true, pushed: 0, off: true });
    const { data: rows, error } = await svc.rpc("league_overtakes");
    if (error) return json({ error: error.message }, 500);
    const cache: { jwt?: string | null } = {};
    let pushed = 0;
    for (const r of ((rows ?? []) as { user_id: string; by_name: string; rank: number; up: number; hours_left: number }[]).slice(0, 500)) {
      const left = r.hours_left >= 48 ? `${Math.floor(r.hours_left / 24)} days left` : r.hours_left > 1 ? `${r.hours_left} hours left` : "the week ends soon";
      pushed += await pushToUser(svc, r.user_id, {
        title: "⚔️ You just got passed",
        body: `${r.by_name} knocked you out of the promotion spots (you're #${r.rank}, top ${r.up} move up). ${left[0].toUpperCase()}${left.slice(1)}.`,
        link: "/rivals",
      }, cache);
      if (cache.jwt === null) break; // push isn't set up
    }
    return json({ ok: true, pushed });
  }

  const { data: key } = await svc.rpc("get_secret", { p_name: "resend_api_key" });
  if (!key) return json({ error: "Add your Resend key in Integrations first." }, 503);
  const { data: cfg } = await svc.from("app_public_config").select("key, value").in("key", ["email_from", "email_reply_to", "app_store_url"]);
  const conf = Object.fromEntries((cfg ?? []).map((x) => [x.key, String(x.value ?? "").trim()]));
  const from = conf.email_from || "TourStar <hello@tourstarapp.com>";
  const replyTo = conf.email_reply_to || undefined;
  const playUrl = conf.app_store_url?.startsWith("https://") ? conf.app_store_url : `${SITE}/play`;
  const { data: settingsRows } = await svc.from("admin_settings").select("key, value").in("key", ["daily_report", "winback"]);
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value as Record<string, unknown>]));
  const day = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });

  // ---- Admin test sends
  if (caller) {
    if (body.action === "test_report") {
      const { data: d, error } = await svc.rpc("daily_report_data");
      if (error) return json({ error: error.message }, 500);
      const err = await send(String(key), from, replyTo, caller.email, reportEmail(d as Record<string, unknown>, day));
      return err ? json({ error: `Resend said: ${err}` }, 502) : json({ ok: true, to: caller.email });
    }
    if (body.action === "test_winback") {
      const stage = [1, 2, 3].includes(Number(body.stage)) ? Number(body.stage) : 1;
      const mail = winbackEmail(stage, "Nova Vega", { fans: 41200, fame: 142000, level: 5, levelName: "", streak: 6 }, "00000000-0000-0000-0000-000000000000", playUrl);
      const err = await send(String(key), from, replyTo, caller.email, { ...mail, subject: `[Sample] ${mail.subject}` });
      return err ? json({ error: `Resend said: ${err}` }, 502) : json({ ok: true, to: caller.email });
    }
    return json({ error: "Unknown action." }, 400);
  }

  // ---- Cron: the daily run
  const result: Record<string, unknown> = {};
  if (fromCron && settings.daily_report?.enabled === true) {
    const { data: d } = await svc.rpc("daily_report_data");
    const { data: admins } = await svc.from("admins").select("email").eq("daily_report", true);
    const mail = reportEmail((d ?? {}) as Record<string, unknown>, day);
    let sent = 0;
    const errors: string[] = [];
    for (const a of admins ?? []) {
      if (!a.email) continue;
      const err = await send(String(key), from, replyTo, a.email, mail);
      if (err) errors.push(`${a.email}: ${err}`); else sent++;
    }
    await svc.from("daily_job_runs").insert({ job: "daily_report", sent, detail: errors.join("; ").slice(0, 500) });
    result.report = { sent, errors: errors.length };
  }
  if (fromCron && settings.winback?.enabled === true) {
    const max = Math.max(0, Math.min(1000, n(settings.winback?.max_per_day) || 300));
    const { data: due, error } = await svc.rpc("winback_batch", { p_limit: max });
    let sent = 0, failed = 0;
    for (const p of (error ? [] : due ?? []) as { user_id: string; email: string; artist: string; stage: number; career: Record<string, unknown> }[]) {
      const token = await svc.rpc("winback_mark", { p_user: p.user_id, p_stage: p.stage });
      if (token.error || !token.data) { failed++; continue; }
      const err = await send(String(key), from, replyTo, p.email, winbackEmail(p.stage, p.artist, snap(p.career), String(token.data), playUrl));
      if (err) failed++; else sent++;
      await new Promise((r) => setTimeout(r, 120)); // stay under Resend's rate limit
    }
    await svc.from("daily_job_runs").insert({ job: "winback", sent, detail: error ? error.message : failed ? `${failed} failed` : "" });
    result.winback = { sent, failed };
  }
  return json({ ok: true, ...result });
});
