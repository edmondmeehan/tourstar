// Shared partner/licensing helpers for the admin (Partners & venues, Packs & Gold).

export interface Partner {
  id: string; name: string; kind: "artist" | "venue" | "brand";
  contact_name: string; contact_email: string; rev_share_pct: number; flat_fee_usd: number;
  license_signed_on: string | null; license_expires_on: string | null;
  approved_assets: string; notes: string; active: boolean; created_at: string;
}

/** Same rule the database uses to hide a partner's packs and venues from players. */
export function licenseState(p: Partner | null | undefined, today = new Date().toISOString().slice(0, 10)) {
  if (!p) return { ok: true, label: "", cls: "" };
  if (!p.active) return { ok: false, label: "PARTNER PAUSED", cls: "text-muted-fg border-line" };
  if (!p.license_signed_on) return { ok: false, label: "NO LICENSE", cls: "text-danger border-danger" };
  if (p.license_expires_on && p.license_expires_on < today) return { ok: false, label: "LICENSE EXPIRED", cls: "text-danger border-danger" };
  const days = p.license_expires_on ? Math.round((Date.parse(p.license_expires_on) - Date.parse(today)) / 864e5) : null;
  if (days !== null && days <= 30) return { ok: true, label: `EXPIRES IN ${days}D`, cls: "text-gold border-gold" };
  return { ok: true, label: "LICENSED", cls: "text-success border-success" };
}

/** Value of 1 Gold in dollars, from the 1,200-for-$9.99 pack, before the store fee. */
export const USD_PER_GOLD = 9.99 / 1200;
/** Share of a sale TourStar keeps after Apple/Google (Small Business Program rate). */
export const AFTER_STORE_FEE = 0.85;
