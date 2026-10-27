// Admin → Beta signups → Emails: the welcome email switch, sender settings, and announcements
// (e.g. the launch email) sent to everyone on the waitlist through Resend.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/cloud";
import { askConfirm, toast } from "../components/ui";
import { campaignEmail, welcomeEmail } from "../../supabase/functions/_shared/email";
import { Section, errMsg, fail, input, when } from "./kit";

interface CampaignRow { id: string; subject: string; created_at: string; finished_at: string | null }
const SAMPLE = { code: "sample1", unsub: "00000000-0000-0000-0000-000000000000", position: 128, referrals: 1 };
const LAUNCH = {
  subject: "TourStar is live 🎸",
  heading: "TourStar is out now!",
  message: "The wait is over. TourStar is live on the App Store.\n\nYour launch-day bonus is waiting: sign up in the app with this email address and it lands in your account, along with any rewards you unlocked by inviting friends.",
  cta_label: "Download TourStar",
  cta_url: "https://tourstarapp.com",
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke("waitlist-broadcast", { body });
  if (error) {
    let msg = errMsg(error);
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  return data as T;
}

export function WaitlistEmails({ audience }: { audience: number }) {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [c, setC] = useState(LAUNCH);
  const [preview, setPreview] = useState<"welcome" | "campaign">("campaign");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<(CampaignRow & { sent: number })[]>([]);

  const load = useCallback(async () => {
    const [p, s, cs] = await Promise.all([
      supabase!.from("app_public_config").select("key, value").in("key", ["waitlist_welcome_enabled", "email_from", "email_reply_to"]),
      supabase!.rpc("admin_list_secrets"),
      supabase!.from("email_campaigns").select("id, subject, created_at, finished_at").order("created_at", { ascending: false }).limit(10),
    ]);
    if (p.error) return fail(p.error);
    const m = Object.fromEntries((p.data ?? []).map((r) => [r.key, r.value as string]));
    setCfg(m); setFrom(m.email_from ?? ""); setReplyTo(m.email_reply_to ?? "");
    if (!s.error) setHasKey((s.data as { name: string }[]).some((r) => r.name === "resend_api_key"));
    const rows = (cs.data ?? []) as CampaignRow[];
    const counts = await Promise.all(rows.map((r) => supabase!.from("waitlist_emails").select("id", { count: "exact", head: true }).eq("campaign", r.id)));
    setCampaigns(rows.map((r, i) => ({ ...r, sent: counts[i].count ?? 0 })));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (key: string, value: string) => {
    const { error } = await supabase!.from("app_public_config").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) return fail(error);
    setCfg((x) => ({ ...x, [key]: value }));
    toast({ ok: true, message: "Saved." });
  };

  const html = useMemo(() => (preview === "welcome" ? welcomeEmail(SAMPLE) : campaignEmail(c, SAMPLE)).html, [preview, c]);
  const welcomeOn = cfg.waitlist_welcome_enabled === "true";

  const test = async () => {
    setBusy(true);
    try {
      const r = await call<{ to: string }>({ action: "test", campaign: c });
      toast({ ok: true, message: `Test sent to ${r.to}. Check your inbox (and spam).` });
    } catch (e) { toast({ ok: false, message: (e as Error).message }); }
    setBusy(false);
  };

  const sendAll = () => askConfirm(
    `Send "${c.subject}" to everyone on the waitlist who hasn't unsubscribed (about ${audience.toLocaleString()} people)? This can't be undone. Send yourself a test first.`,
    async () => {
      // Resume an unfinished send of the same email instead of starting over (nobody gets it twice).
      const unfinished = campaigns.find((x) => !x.finished_at && x.subject === c.subject.trim());
      const id = unfinished?.id ?? `${c.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40)}-${new Date().toISOString().slice(0, 16).replace(/[^0-9]/g, "")}`;
      setBusy(true);
      let total = 0;
      try {
        for (let i = 0; i < 200; i++) {
          const r = await call<{ sent: number; remaining: number }>({ action: "send", id, campaign: c });
          total += r.sent;
          setProgress(`Sent ${total.toLocaleString()}… ${r.remaining.toLocaleString()} to go`);
          if (r.remaining === 0 || r.sent === 0) break;
        }
        toast({ ok: true, message: `Sent to ${total.toLocaleString()} people.` });
      } catch (e) {
        toast({ ok: false, message: `${(e as Error).message} Sent ${total} before stopping; sending again picks up where it left off.` });
      }
      setProgress(null); setBusy(false); void load();
    }, { yes: "Send to everyone", danger: true });

  const field = (k: keyof typeof LAUNCH, label: string, multi = false) => (
    <label className="block mb-3">
      <span className="text-xs text-muted-fg">{label}</span>
      {multi
        ? <textarea className={`${input} mt-1 min-h-[120px]`} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
        : <input className={`${input} mt-1`} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} />}
    </label>
  );

  return (
    <Section title="Emails" sub="Sent through Resend from your own domain. Every email includes the person's invite link, your mailing address and a one-click unsubscribe.">
      {hasKey === false && <p className="text-sm text-gold mb-4">○ Add your Resend key in <b>Integrations</b> first. Nothing sends until then.</p>}

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <label className="block"><span className="text-xs text-muted-fg">From</span>
          <div className="flex gap-2 mt-1"><input className={input} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="TourStar <hello@tourstarapp.com>" />
            <button className="btn btn-ghost text-xs" disabled={from === (cfg.email_from ?? "")} onClick={() => save("email_from", from.trim())}>Save</button></div></label>
        <label className="block"><span className="text-xs text-muted-fg">Replies go to</span>
          <div className="flex gap-2 mt-1"><input className={input} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="help@please.co" />
            <button className="btn btn-ghost text-xs" disabled={replyTo === (cfg.email_reply_to ?? "")} onClick={() => save("email_reply_to", replyTo.trim())}>Save</button></div></label>
      </div>
      <p className="text-[11px] text-muted-fg mb-5">The From address's domain (e.g. tourstarapp.com) must be verified in Resend → Domains, or emails won't send.</p>

      <div className="flex items-start gap-4 py-3 border-t border-line">
        <button role="switch" aria-checked={welcomeOn} onClick={() => askConfirm(welcomeOn ? "Stop sending the welcome email to new signups?" : "Start emailing every new signup their spot and invite link?", () => void save("waitlist_welcome_enabled", String(!welcomeOn)), { yes: welcomeOn ? "Turn off" : "Turn on" })}
          className={`w-10 h-6 rounded-full shrink-0 relative transition ${welcomeOn ? "bg-[var(--neon-pink)]" : "bg-black/50 border border-line"}`}>
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${welcomeOn ? "left-5" : "left-1"}`} />
        </button>
        <div className="flex-1">
          <div className="text-sm font-semibold">Welcome email</div>
          <div className="text-xs text-muted-fg mt-0.5">Sent right after someone joins: their spot in line, their invite link and the referral rewards. Someone who signs up again gets their link re-sent (at most once an hour).</div>
        </div>
        <button className="text-xs underline text-muted-fg" onClick={() => setPreview("welcome")}>Preview</button>
      </div>

      <div className="border-t border-line pt-4 mt-1">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Announcement to the whole list</div>
          <button className="text-xs underline text-muted-fg" onClick={() => setC(LAUNCH)}>Reset to launch email</button>
        </div>
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            {field("subject", "Subject line")}
            {field("heading", "Headline")}
            {field("message", "Message (blank line = new paragraph)", true)}
            <div className="grid grid-cols-2 gap-3">{field("cta_label", "Button text")}{field("cta_url", "Button link (https://…)")}</div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button className="btn btn-ghost text-sm" disabled={busy || !hasKey || !c.subject.trim()} onClick={test}>Send a test to me</button>
              <button className="btn btn-pink text-sm" disabled={busy || !hasKey || !c.subject.trim() || audience === 0} onClick={sendAll}>Send to everyone ({audience.toLocaleString()})</button>
            </div>
            {progress && <p className="text-xs text-gold mt-2" role="status">{progress}</p>}
          </div>
          <div>
            <div className="flex gap-3 text-xs mb-2">
              <button className={preview === "campaign" ? "underline font-semibold" : "text-muted-fg"} onClick={() => setPreview("campaign")}>Announcement preview</button>
              <button className={preview === "welcome" ? "underline font-semibold" : "text-muted-fg"} onClick={() => setPreview("welcome")}>Welcome preview</button>
            </div>
            <iframe title="Email preview" srcDoc={html} sandbox="" className="w-full h-[560px] rounded border border-line bg-[#05040f]" />
          </div>
        </div>
      </div>

      {campaigns.length > 0 && (
        <div className="border-t border-line pt-4 mt-5">
          <div className="text-sm font-semibold mb-2">Sent announcements</div>
          <ul className="divide-y divide-line text-sm">
            {campaigns.map((x) => (
              <li key={x.id} className="py-2 flex gap-3 items-center">
                <span className="flex-1 truncate">{x.subject}</span>
                <span className="text-xs text-muted-fg tabular-nums">{x.sent.toLocaleString()} sent</span>
                <span className={`text-[10px] px-2 py-0.5 rounded border ${x.finished_at ? "text-success border-success" : "text-gold border-gold"}`}>{x.finished_at ? "DONE" : "PARTIAL"}</span>
                <span className="text-[11px] text-muted-fg whitespace-nowrap">{when(x.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
