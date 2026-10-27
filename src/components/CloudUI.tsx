import { Link, useNavigate } from "react-router-dom";
import { levelFor } from "../game/engine";
import type { Career } from "../game/types";
import { useGame } from "../game/store";
import { applyCloudSave, cloudConfigured, keepLocalSave, useCloud, type SyncState } from "../lib/cloud";
import { useConcert } from "../concert/useConcert";
import { dismissAnnouncement, useLive } from "../lib/live";
import { Modal } from "./ui";

const PILL: Record<SyncState, { label: string; color: string; dot: string }> = {
  guest: { label: "GUEST", color: "var(--muted-foreground)", dot: "○" },
  unconfirmed: { label: "CONFIRM EMAIL", color: "var(--gold)", dot: "◐" },
  syncing: { label: "SAVING", color: "var(--electric)", dot: "◌" },
  synced: { label: "SYNCED", color: "var(--success)", dot: "●" },
  offline: { label: "OFFLINE", color: "var(--gold)", dot: "◐" },
  error: { label: "NOT SYNCED", color: "var(--danger)", dot: "!" },
};

/** Small header pill: is this career backed up? Tapping it opens Account. */
export function SyncPill() {
  const sync = useCloud((s) => s.sync);
  if (!cloudConfigured) return null;
  const p = PILL[sync];
  return (
    <Link to={sync === "guest" ? "/login" : "/account"} className="font-pixel text-[7px] px-2 py-1.5 rounded bg-black/40 border border-line whitespace-nowrap" style={{ color: p.color }} title="Cloud save status">
      {p.dot} {p.label}
    </Link>
  );
}

/** After the first gig, offer guests an account so the career is safe. Shown once. */
export function SavePrompt() {
  const nav = useNavigate();
  const gigs = useGame((s) => s.career?.totals.gigs ?? 0);
  const busy = useGame((s) => s.celebrations.length > 0 || !!s.lastOutcome || !!s.career?.pendingEvent);
  const concert = useConcert((s) => s.open);
  const { sync, promptDismissed, set } = useCloud();
  const open = cloudConfigured && sync === "guest" && !promptDismissed && gigs >= 1 && !concert && !busy;
  return (
    <Modal open={open} onClose={() => set({ promptDismissed: true })}>
      <div className="text-center">
        <div className="text-4xl mb-3">☁️</div>
        <h2 className="font-pixel text-xs mb-3" style={{ color: "var(--gold)" }}>SAVE YOUR CAREER</h2>
        <p className="text-sm mb-5">First gig done. Make a free account so your career is backed up and plays on any device.</p>
        <button className="btn btn-pink w-full mb-2" onClick={() => { set({ promptDismissed: true }); nav("/login"); }}>Create account</button>
        <button className="btn btn-ghost w-full" onClick={() => set({ promptDismissed: true })}>Maybe later</button>
        <p className="text-[11px] text-muted-fg mt-3">You can do this anytime from Account.</p>
      </div>
    </Modal>
  );
}

function Summary({ c, label }: { c: Career; label: string }) {
  const l = levelFor(c.stats.fame);
  return (
    <div className="panel p-3 text-left">
      <div className="font-pixel text-[8px] text-muted-fg mb-1">{label}</div>
      <div className="font-bold">{c.name}</div>
      <div className="text-xs text-muted-fg">LV{l.level} {l.name} · {c.stats.fame.toLocaleString()} fame · week {c.week}</div>
    </div>
  );
}

/** Signing in on a device that already has a different career: pick which one to keep. */
export function ConflictModal() {
  const conflict = useCloud((s) => s.conflict);
  if (!conflict) return null;
  return (
    <Modal open dismissable={false}>
      <h2 className="font-pixel text-xs mb-3 text-center" style={{ color: "var(--gold)" }}>TWO CAREERS FOUND</h2>
      <p className="text-sm mb-4 text-center">Your account has a different career than this device. Which one do you want to keep playing? The other will be replaced.</p>
      <div className="grid gap-2 mb-4">
        <Summary c={conflict.cloud} label="SAVED IN YOUR ACCOUNT" />
        <Summary c={conflict.local} label="ON THIS DEVICE" />
      </div>
      <button className="btn btn-pink w-full mb-2" onClick={() => applyCloudSave({ career: conflict.cloud, settings: conflict.cloudSettings, membership: conflict.cloudMembership })}>Keep {conflict.cloud.name} (account)</button>
      <button className="btn btn-primary w-full" onClick={keepLocalSave}>Keep {conflict.local.name} (this device)</button>
    </Modal>
  );
}

/** Admin announcements: banners sit under the header; pop-ups show once when nothing else is on screen. */
export function AnnouncementBanner() {
  const nav = useNavigate();
  const items = useLive((s) => s.announcements);
  const dismissed = useLive((s) => s.dismissedAnnouncements);
  const a = items.find((x) => x.style === "banner" && !dismissed.includes(x.id));
  if (!a) return null;
  return (
    <div className="panel mb-4 p-3 flex gap-3 items-start animate-slide-up" style={{ borderColor: "var(--electric)" }}>
      <span className="font-pixel text-[8px] mt-1 shrink-0" style={{ color: "var(--electric)" }}>NEWS</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold">{a.title}</div>
        {a.body && <div className="text-xs text-muted-fg mt-1 whitespace-pre-line">{a.body}</div>}
        {a.cta_label && a.cta_route && (
          <button className="text-xs underline mt-2" style={{ color: "var(--electric)" }} onClick={() => { dismissAnnouncement(a.id); nav(a.cta_route!); }}>{a.cta_label} →</button>
        )}
      </div>
      <button aria-label="Dismiss" className="text-muted-fg text-sm px-1" onClick={() => dismissAnnouncement(a.id)}>✕</button>
    </div>
  );
}

export function AnnouncementPopup() {
  const nav = useNavigate();
  const items = useLive((s) => s.announcements);
  const dismissed = useLive((s) => s.dismissedAnnouncements);
  const busy = useGame((s) => s.celebrations.length > 0 || !!s.lastOutcome || !!s.career?.pendingEvent);
  const concert = useConcert((s) => s.open);
  const a = items.find((x) => x.style === "popup" && !dismissed.includes(x.id));
  if (!a || busy || concert) return null;
  return (
    <Modal open onClose={() => dismissAnnouncement(a.id)}>
      <div className="text-center">
        <div className="font-pixel text-[8px] mb-3" style={{ color: "var(--electric)" }}>ANNOUNCEMENT</div>
        <h2 className="font-pixel text-xs mb-3 leading-relaxed" style={{ color: "var(--gold)" }}>{a.title.toUpperCase()}</h2>
        {a.body && <p className="text-sm mb-5 whitespace-pre-line">{a.body}</p>}
        {a.cta_label && a.cta_route && (
          <button className="btn btn-pink w-full mb-2" onClick={() => { dismissAnnouncement(a.id); nav(a.cta_route!); }}>{a.cta_label}</button>
        )}
        <button className="btn btn-ghost w-full" onClick={() => dismissAnnouncement(a.id)}>Close</button>
      </div>
    </Modal>
  );
}
