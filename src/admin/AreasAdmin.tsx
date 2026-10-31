// Admin → Players → Areas: find players by area using their optional zip / postal codes.
// Search a radius around a city or zip, a state/province, a county, a city, or a zip range / prefix.
// The zip database (US: GeoNames, Canada: first 3 characters) is a static file loaded only here; the
// server only returns player counts per code, and contact emails only for players who opted in.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/cloud";
import { toast } from "../components/ui";
import { Kpi, Section, input } from "./kit";

type Row = [code: string, place: string, state: string, county: string, lat: number, lon: number];
interface Count { country: string; code: string; players: number; opted_in: number }
type Mode = "radius" | "state" | "county" | "city" | "range";

const miles = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 7918 * Math.asin(Math.sqrt(h));
};
const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
const codeOf = (postal: string) => { const s = norm(postal); return /^\d{5}/.test(s) ? s.slice(0, 5) : /^[A-Z]\d[A-Z]/.test(s) ? s.slice(0, 3) : s.split(" ")[0]; };

let cache: Row[] | null = null;
async function loadZips(): Promise<Row[]> {
  if (cache) return cache;
  const res = await fetch("/geo/postal.json");
  cache = ((await res.json()) as { rows: Row[] }).rows;
  return cache;
}

/** "Sacramento", "Sacramento, CA", "95811" or "M5V" → a center point. */
function findCenter(zips: Row[], q: string): { lat: number; lon: number; label: string } | null {
  const s = norm(q);
  if (!s) return null;
  const byCode = zips.find((z) => z[0] === codeOf(s));
  if (byCode) return { lat: byCode[4], lon: byCode[5], label: `${byCode[0]} · ${byCode[1]}, ${byCode[2]}` };
  const [city, st] = s.split(",").map((x) => x.trim());
  const hits = zips.filter((z) => z[1].toUpperCase() === city && (!st || z[2] === st));
  if (!hits.length) return null;
  // Use the state with the most matching zips (Sacramento → CA, not KY).
  const states = new Map<string, Row[]>();
  hits.forEach((h) => states.set(h[2], [...(states.get(h[2]) ?? []), h]));
  const best = [...states.values()].sort((a, b) => b.length - a.length)[0];
  return { lat: best.reduce((n, z) => n + z[4], 0) / best.length, lon: best.reduce((n, z) => n + z[5], 0) / best.length, label: `${best[0][1]}, ${best[0][2]}` };
}

export function AreasTab() {
  const [zips, setZips] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Count[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("radius");
  const [q, setQ] = useState("Sacramento, CA");
  const [dist, setDist] = useState(40);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    void loadZips().then(setZips).catch(() => setErr("Couldn't load the zip database."));
    void supabase!.rpc("admin_postal_counts").then(({ data, error }) => (error ? setErr("Run the player location SQL in Supabase to turn this on.") : setCounts((data ?? []) as Count[])));
  }, []);

  const result = useMemo(() => {
    if (!zips) return null;
    const s = norm(q);
    let center: ReturnType<typeof findCenter> = null;
    let picked: (Row & { d?: number })[] = [];
    if (mode === "radius") {
      center = findCenter(zips, q);
      if (!center) return { error: `Couldn't find "${q}". Try a zip, or "City, ST".` };
      picked = zips.map((z) => Object.assign([...z], { d: miles(center!, { lat: z[4], lon: z[5] }) }) as Row & { d: number }).filter((z) => z.d! <= dist).sort((a, b) => a.d! - b.d!);
    } else if (mode === "state") picked = zips.filter((z) => z[2] === s);
    else if (mode === "county") { const [cty, st] = s.split(",").map((x) => x.trim()); picked = zips.filter((z) => z[3].toUpperCase() === cty.replace(/ COUNTY$/, "") && (!st || z[2] === st)); }
    else if (mode === "city") { const [cty, st] = s.split(",").map((x) => x.trim()); picked = zips.filter((z) => z[1].toUpperCase() === cty && (!st || z[2] === st)); }
    else {
      const a = norm(from), b = norm(to);
      if (!a) return { error: "Enter a zip prefix (958), a range (95600 to 95899) or a Canadian prefix (M5)." };
      const L = Math.max(a.length, b.length);
      picked = b ? zips.filter((z) => { const k = z[0].slice(0, L); return k >= a.padEnd(L, "0") && k <= b.padEnd(L, "9"); }) : zips.filter((z) => z[0].startsWith(a));
    }
    const byCode = new Map((counts ?? []).map((c) => [c.code, c]));
    const rows = picked.map((z) => ({ z, c: byCode.get(z[0]) }));
    const players = rows.reduce((n, r) => n + Number(r.c?.players ?? 0), 0);
    const opted = rows.reduce((n, r) => n + Number(r.c?.opted_in ?? 0), 0);
    // UK players are matched by outward code only (no UK zip database yet).
    const uk = mode === "range" && /^[A-Z]{1,2}\d?/.test(norm(from)) && !/^[A-Z]\d[A-Z]/.test(norm(from))
      ? (counts ?? []).filter((c) => c.country === "GB" && c.code.startsWith(norm(from))) : [];
    return { center, rows, players: players + uk.reduce((n, c) => n + Number(c.players), 0), opted: opted + uk.reduce((n, c) => n + Number(c.opted_in), 0), uk };
  }, [zips, counts, mode, q, dist, from, to]);

  const exportCsv = (name: string, lines: string[][]) => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const blob = new Blob([lines.map((l) => l.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  };
  const exportCounts = () => {
    if (!result || "error" in result) return;
    exportCsv("tourstar-area-counts.csv", [["code", "place", "state", "county", "miles", "players", "opted_in"],
      ...result.rows.filter((r) => r.c).map((r) => [r.z[0], r.z[1], r.z[2], r.z[3], r.z.d !== undefined ? r.z.d.toFixed(1) : "", String(r.c!.players), String(r.c!.opted_in)]),
      ...result.uk.map((c) => [c.code, "", "UK", "", "", String(c.players), String(c.opted_in)])]);
  };
  const exportContacts = async () => {
    if (!result || "error" in result) return;
    const codes = [...result.rows.filter((r) => r.c?.opted_in).map((r) => r.z[0]), ...result.uk.filter((c) => c.opted_in).map((c) => c.code)];
    if (!codes.length) return toast({ ok: false, message: "Nobody in this area has opted in to local emails yet." });
    const { data, error } = await supabase!.rpc("admin_area_contacts", { p_codes: codes });
    if (error) return toast({ ok: false, message: error.message });
    const list = (data ?? []) as { email: string; artist_name: string | null; postal_code: string; country: string; opted_in_at: string | null }[];
    exportCsv("tourstar-area-contacts.csv", [["email", "artist", "postal_code", "country", "opted_in_at"], ...list.map((r) => [r.email, r.artist_name ?? "", r.postal_code, r.country, r.opted_in_at ?? ""])]);
  };

  return (
    <Section title="Players by area" sub="From players' optional zip / postal codes. Search a radius, state or province, county, city, or a zip range. Contact exports include only players who opted in to local emails.">
      {err && <p className="text-xs text-danger mb-3">{err}</p>}
      <div className="flex flex-wrap gap-2 mb-3">
        {(["radius", "state", "county", "city", "range"] as Mode[]).map((m) => (
          <button key={m} className={`btn ${mode === m ? "btn-primary" : "btn-ghost"} !px-3 text-xs`} onClick={() => setMode(m)}>
            {{ radius: "📍 Radius", state: "State / province", county: "County", city: "City", range: "Zip range" }[m]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center mb-4">
        {mode === "range" ? (
          <>
            <input className={`${input} !w-40`} placeholder="From (e.g. 956 or 95600)" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-xs text-muted-fg">to</span>
            <input className={`${input} !w-40`} placeholder="To (optional, 95899)" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        ) : (
          <input className={`${input} flex-1 min-w-[12rem]`} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={{ radius: "City, ST or zip (Sacramento, CA · 95811 · M5V)", state: "State or province code (CA, TN, ON)", county: "County, ST (Placer, CA)", city: "City, ST (Roseville, CA)", range: "" }[mode]} />
        )}
        {mode === "radius" && (
          <select className={`${input} !w-auto`} value={dist} onChange={(e) => setDist(Number(e.target.value))}>
            {[10, 25, 40, 50, 75, 100, 150, 250].map((n) => <option key={n} value={n}>{n} miles</option>)}
          </select>
        )}
      </div>

      {!zips || !counts ? <p className="text-xs text-muted-fg">{err ? "" : "Loading…"}</p> : !result ? null : "error" in result ? <p className="text-xs text-danger">{result.error}</p> : (
        <>
          {result.center && <p className="text-xs text-muted-fg mb-3">Center: <b className="text-fg">{result.center.label}</b> · {result.rows.length.toLocaleString()} zip codes within {dist} miles</p>}
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <Kpi label="Players in this area" value={result.players} />
            <Kpi label="Opted in to local emails" value={result.opted} />
            <Kpi label="Zip codes in the area" value={result.rows.length} sub={`${result.rows.filter((r) => r.c).length} with players`} />
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <button className="btn btn-ghost text-xs" onClick={exportCounts}>Export counts (CSV)</button>
            <button className="btn btn-gold text-xs" onClick={() => void exportContacts()}>Export opted-in contacts (CSV)</button>
            <label className="flex items-center gap-1 text-[11px] text-muted-fg ml-auto"><input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />Show zips with no players</label>
          </div>
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--panel,#0b0b1e)]"><tr className="text-[11px] text-muted-fg text-left"><th className="py-1.5">Code</th><th>Place</th><th>County</th><th>State</th>{mode === "radius" && <th>Miles</th>}<th className="text-right">Players</th><th className="text-right">Opted in</th></tr></thead>
              <tbody>
                {result.rows.filter((r) => showEmpty || r.c).slice(0, 1000).map((r) => (
                  <tr key={r.z[0]} className="border-t border-line">
                    <td className="py-1 font-mono text-xs">{r.z[0]}</td><td className="text-xs">{r.z[1]}</td><td className="text-xs text-muted-fg">{r.z[3]}</td><td className="text-xs">{r.z[2]}</td>
                    {mode === "radius" && <td className="text-xs tabular-nums text-muted-fg">{r.z.d?.toFixed(1)}</td>}
                    <td className="text-right tabular-nums">{Number(r.c?.players ?? 0) || <span className="text-muted-fg">0</span>}</td>
                    <td className="text-right tabular-nums">{Number(r.c?.opted_in ?? 0) || <span className="text-muted-fg">0</span>}</td>
                  </tr>
                ))}
                {result.uk.map((c) => <tr key={c.code} className="border-t border-line"><td className="py-1 font-mono text-xs">{c.code}</td><td className="text-xs" colSpan={3}>United Kingdom</td><td className="text-right tabular-nums">{c.players}</td><td className="text-right tabular-nums">{c.opted_in}</td></tr>)}
              </tbody>
            </table>
            {result.rows.filter((r) => showEmpty || r.c).length === 0 && !result.uk.length && <p className="text-xs text-muted-fg py-4 text-center">No players in this area yet.</p>}
          </div>
        </>
      )}
      <p className="text-[10px] text-muted-fg mt-4">US zip data © GeoNames (geonames.org), CC BY 4.0. Canada uses the first 3 characters of the postal code; UK players can be found by postcode prefix in Zip range.</p>
    </Section>
  );
}
