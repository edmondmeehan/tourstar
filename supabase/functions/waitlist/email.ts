// TourStar emails (Resend). Shared by the `waitlist` and `waitlist-broadcast` functions.
// Kept in sync by copying this file into each function folder at deploy time.

export const SITE = "https://tourstarapp.com";
export const ADDRESS = "TourStar, LLC · 1133 Broadway, #1301, New York, NY 10010";

/** Referral rewards, delivered at launch to the TourStar account created with the same email. */
export const TIERS = [
  { friends: 1, reward: "+500 ⭐ reward points" },
  { friends: 3, reward: "Founding Fan badge + 1,500 ⭐" },
  { friends: 10, reward: "5 free tickets to the launch raffle" },
];

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const inviteLink = (code: string) => `${SITE}/?r=${code}`;
const unsubLink = (token: string) => `${SITE}/?unsubscribe=${token}`;

interface Person { code: string; unsub: string; position: number; referrals: number }

function shell(inner: string, p: Person, preheader: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark light"></head>
<body style="margin:0;padding:0;background:#05040f;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05040f;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0e0c24;border:1px solid #2a2650;border-radius:16px;">
<tr><td align="center" style="padding:28px 28px 8px;"><a href="${SITE}"><img src="${SITE}/brand/tourstar-logo.png" width="220" alt="TourStar" style="display:block;border:0;width:220px;max-width:100%;height:auto;"></a></td></tr>
<tr><td style="padding:8px 28px 28px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#e9e6ff;font-size:16px;line-height:1.55;">${inner}</td></tr>
</table>
<p style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#7d79a6;font-size:12px;line-height:1.6;margin:18px 0 0;max-width:520px;">
You're getting this because you joined the TourStar waitlist. Copyright © 2026 TourStar, LLC. Prizes fulfilled by Please and Thank You, Inc.<br>${esc(ADDRESS)}<br>
<a href="${unsubLink(p.unsub)}" style="color:#7d79a6;">Unsubscribe</a> · <a href="${SITE}/privacy" style="color:#7d79a6;">Privacy</a>
</p></td></tr></table></body></html>`;
}

const button = (label: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="background:#ff2e88;border-radius:10px;"><a href="${esc(url)}" style="display:inline-block;padding:13px 22px;font-weight:700;color:#ffffff;text-decoration:none;font-size:15px;">${esc(label)}</a></td></tr></table>`;

function inviteBlock(p: Person) {
  const link = inviteLink(p.code);
  const tiers = TIERS.map((t) => {
    const done = p.referrals >= t.friends;
    return `<tr><td style="padding:4px 0;color:${done ? "#3ddc97" : "#b9b5e0"};font-size:14px;">${done ? "✅" : "⬜️"} <b>${t.friends} friend${t.friends > 1 ? "s" : ""}</b>: ${esc(t.reward)}</td></tr>`;
  }).join("");
  return `<div style="background:#16133a;border-radius:12px;padding:18px;margin:18px 0;">
<p style="margin:0 0 6px;font-size:13px;color:#b9b5e0;">Your invite link</p>
<p style="margin:0 0 14px;font-size:16px;"><a href="${link}" style="color:#ffd23f;font-weight:700;word-break:break-all;">${link.replace("https://", "")}</a></p>
<p style="margin:0 0 8px;font-size:14px;color:#e9e6ff;">Every friend who joins with your link moves you up the list and unlocks launch rewards:</p>
<table role="presentation" cellpadding="0" cellspacing="0">${tiers}</table>
</div>`;
}

export function welcomeEmail(p: Person) {
  const html = shell(`
<h1 style="margin:8px 0 12px;font-size:24px;line-height:1.25;color:#ffffff;">You're on the list! 🎤</h1>
<p style="margin:0 0 12px;">Thanks for joining TourStar, the music career game where you play every show. You're <b style="color:#ffd23f;">#${p.position.toLocaleString("en-US")}</b> in line for early access.</p>
${inviteBlock(p)}
<p style="margin:0 0 12px;">We'll email you the moment TourStar hits the App Store, with your launch-day bonus.</p>
<p style="margin:0;color:#b9b5e0;">See you on stage,<br>The TourStar crew</p>`, p, `You're #${p.position} in line. Invite friends to move up.`);
  const text = `You're on the TourStar list! You're #${p.position} in line for early access.

Your invite link: ${inviteLink(p.code)}
Every friend who joins with your link moves you up the list and unlocks launch rewards:
${TIERS.map((t) => `- ${t.friends} friend${t.friends > 1 ? "s" : ""}: ${t.reward}`).join("\n")}

We'll email you when TourStar hits the App Store.

Copyright © 2026 TourStar, LLC.
${ADDRESS}
Unsubscribe: ${unsubLink(p.unsub)}`;
  return { subject: "You're on the TourStar list 🎤", html, text };
}

export interface Campaign { subject: string; heading?: string | null; message?: string | null; cta_label?: string | null; cta_url?: string | null }

/** Announcement / launch email. `message` is plain text; blank lines become paragraphs. */
export function campaignEmail(c: Campaign, p: Person) {
  const paras = (c.message ?? "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean)
    .map((t) => `<p style="margin:0 0 12px;">${esc(t).replace(/\n/g, "<br>")}</p>`).join("");
  const html = shell(`
${c.heading ? `<h1 style="margin:8px 0 12px;font-size:24px;line-height:1.25;color:#ffffff;">${esc(c.heading)}</h1>` : ""}
${paras}
${c.cta_label && c.cta_url ? button(c.cta_label, c.cta_url) : ""}
${inviteBlock(p)}
<p style="margin:0;color:#b9b5e0;">See you on stage,<br>The TourStar crew</p>`, p, c.heading ?? c.subject);
  const text = `${c.heading ? c.heading + "\n\n" : ""}${c.message ?? ""}${c.cta_label && c.cta_url ? `\n\n${c.cta_label}: ${c.cta_url}` : ""}

Your invite link: ${inviteLink(p.code)}

Copyright © 2026 TourStar, LLC.
${ADDRESS}
Unsubscribe: ${unsubLink(p.unsub)}`;
  return { subject: c.subject, html, text };
}

export const unsubHeaders = (token: string) => ({
  "List-Unsubscribe": `<${unsubLink(token)}>`,
});

export async function resend(path: string, key: string, body: unknown) {
  const r = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null) as Record<string, unknown> | null;
  if (!r.ok) throw Object.assign(new Error(String((data?.message as string) ?? `Resend ${r.status}`)), { status: r.status });
  return data;
}
