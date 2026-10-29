import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSite } from "../lib/site";
import { STORE, LEVELS, type StoreItem } from "../game/data";
import { fmtMoney, levelFor } from "../game/engine";
import { useGame } from "../game/store";
import { Card, DeltaChips, Modal, PageTitle, Tag, toast, askConfirm } from "../components/ui";
import { cloudConfigured, useCloud } from "../lib/cloud";
import { DropsTab } from "./Drops";
import { MerchTab } from "./Merch";
import { RAFFLE_DISCLAIMER, enterRaffle, loadRewards, redeem, useRewards, type Raffle, type RewardItem } from "../lib/rewards";

type Tab = "rewards" | "raffles" | "drops" | "merch" | "shop";
const levelName = (n: number) => LEVELS.find((l) => l.level === n)?.name ?? `Level ${n}`;
const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending review", color: "var(--muted-foreground)" },
  approved: { label: "Approved", color: "var(--electric)" },
  shipped: { label: "Shipped", color: "var(--electric)" },
  fulfilled: { label: "Delivered", color: "var(--success)" },
  rejected: { label: "Declined · points refunded", color: "var(--danger)" },
};

export default function Store() {
  const [params] = useSearchParams();
  const rafflesOn = useSite((s) => s.raffles);
  const [picked, setTab] = useState<Tab>(() => (["rewards", "raffles", "drops", "merch", "shop"].includes(params.get("tab") ?? "") ? params.get("tab") as Tab : "rewards"));
  const tab: Tab = picked === "raffles" && !rafflesOn ? "rewards" : picked;
  const tabs = ([["rewards", "🎁 Rewards"], ["raffles", "🎟️ Raffles"], ["drops", "💿 Drops"], ["merch", "👕 Merch"], ["shop", "🛒 Shop"]] as const).filter(([id]) => id !== "raffles" || rafflesOn);
  const session = useCloud((s) => s.session);
  const c = useGame((s) => s.career)!;
  const points = useRewards((s) => s.points);

  useEffect(() => { if (cloudConfigured) void loadRewards(); }, [session]);

  const balance = points?.balance ?? c.pointsEarned ?? 0;

  return (
    <div>
      <div className="panel p-4 mb-4 text-center" style={{ borderColor: "var(--gold)", background: "linear-gradient(135deg, oklch(20% .08 340), oklch(16% .06 270))" }}>
        <div className="font-pixel text-[8px] text-muted-fg">THE</div>
        <div className="font-logo text-2xl my-1" style={{ color: "var(--gold)" }}>Please &amp; Thank You</div>
        <div className="font-pixel text-[8px] text-muted-fg">STORE</div>
        <div className="mt-3 font-pixel text-[11px]" style={{ color: "var(--gold)" }}>⭐ {balance.toLocaleString()} POINTS</div>
        <div className="text-[11px] text-muted-fg mt-1">Earn points from gigs, releases, daily rewards, quests and level-ups.</div>
        {!!points?.pending && <div className="text-[11px] mt-1" style={{ color: "var(--gold)" }}>+{points.pending.toLocaleString()} pending review · <a className="underline" href="https://tourstarapp.com/support">why?</a></div>}
      </div>

      <div className={`grid ${tabs.length === 5 ? "grid-cols-5" : "grid-cols-4"} gap-1.5 mb-4`} role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`font-pixel text-[8px] py-2.5 rounded border ${tab === id ? "border-pink text-pink bg-black/30" : "border-line text-muted-fg"}`}>{label.toUpperCase()}</button>
        ))}
      </div>

      {tab === "rewards" && <Rewards />}
      {tab === "raffles" && <Raffles />}
      {tab === "drops" && <DropsTab />}
      {tab === "merch" && <MerchTab />}
      {tab === "shop" && <Shop />}
    </div>
  );
}

function SignInNudge({ what }: { what: string }) {
  return (
    <Card className="mb-4" glow="gold">
      <div className="text-sm">Your points are saved on this device. Create a free account to {what}. Points you've earned come with you.</div>
      <div className="flex gap-2 mt-3">
        <Link to="/login" className="btn btn-pink flex-1 text-center">Create account</Link>
        <Link to="/login?mode=signin" className="btn btn-ghost flex-1 text-center">Sign in</Link>
      </div>
    </Card>
  );
}

function Unavailable() {
  return <p className="text-sm text-muted-fg text-center py-8">Real rewards and raffles are available in the TourStar app.</p>;
}

// ---------------------------------------------------------------- rewards

function Rewards() {
  const { items, redemptions, points, loading, error } = useRewards();
  const session = useCloud((s) => s.session);
  const c = useGame((s) => s.career)!;
  const [pick, setPick] = useState<RewardItem | null>(null);
  if (!cloudConfigured) return <Unavailable />;
  const level = points?.level ?? c.peakLevel;
  const balance = points?.balance ?? c.pointsEarned ?? 0;

  return (
    <div>
      <p className="text-xs text-muted-fg mb-3">Real merch, records and VIP experiences from Please &amp; Thank You. Some unlock as your career grows.</p>
      {!session && <SignInNudge what="redeem real rewards" />}
      {error && <p className="text-xs text-danger mb-3">{error} <button className="underline" onClick={() => void loadRewards()}>Retry</button></p>}
      {loading && !items.length && <p className="text-sm text-muted-fg text-center py-6">Loading rewards…</p>}
      {!loading && !items.length && !error && <p className="text-sm text-muted-fg text-center py-6">New rewards are on the way. Keep earning points!</p>}
      <div className="space-y-3">
        {items.map((i) => {
          const locked = level < i.min_level;
          const soldOut = i.stock !== null && i.stock < 1;
          const short = balance < i.cost_points;
          return (
            <Card key={i.id} className={locked ? "opacity-60" : ""}>
              <div className="flex gap-3">
                {i.image_url ? <img src={i.image_url} alt="" className="w-16 h-16 rounded object-cover shrink-0" /> : <div className="text-4xl w-16 text-center shrink-0">{i.emoji}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm">{i.name}</div>
                    <Tag>{i.category}</Tag>
                  </div>
                  {i.description && <p className="text-xs text-muted-fg mt-1">{i.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                    <span className="font-pixel text-[9px]" style={{ color: "var(--gold)" }}>⭐ {i.cost_points.toLocaleString()}</span>
                    {i.stock !== null && <span className="text-muted-fg">{soldOut ? "Sold out" : `${i.stock} left`}</span>}
                  </div>
                </div>
              </div>
              {locked ? (
                <div className="mt-3 text-center"><Tag color="var(--gold)">🔒 UNLOCKS AT LV{i.min_level} · {levelName(i.min_level).toUpperCase()}</Tag></div>
              ) : (
                <button className="btn btn-gold w-full mt-3" disabled={!session || soldOut || short} onClick={() => setPick(i)}>
                  {soldOut ? "Sold out" : !session ? "Sign in to redeem" : short ? `Need ${(i.cost_points - balance).toLocaleString()} more points` : "Redeem"}
                </button>
              )}
            </Card>
          );
        })}
      </div>

      {redemptions.length > 0 && (
        <>
          <h3 className="font-pixel text-[9px] text-muted-fg mt-6 mb-2">MY REWARDS</h3>
          <ul className="space-y-1.5">
            {redemptions.map((r) => (
              <li key={r.id} className="panel px-3 py-2 flex justify-between items-center gap-2 text-sm">
                <span className="min-w-0 truncate">{r.item_name}{r.option ? ` · ${r.option}` : ""}</span>
                <span className="text-[11px] shrink-0" style={{ color: STATUS[r.status].color }}>{STATUS[r.status].label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {pick && <RedeemSheet item={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

function RedeemSheet({ item, onClose }: { item: RewardItem; onClose: () => void }) {
  const email = useCloud((s) => s.email) ?? "";
  const [option, setOption] = useState<string>(item.options[0] ?? "");
  const [ship, setShip] = useState({ name: "", address: "", email, phone: "" });
  const [busy, setBusy] = useState(false);
  const input = "w-full mt-1 px-3 py-2 rounded bg-black/50 border border-line outline-none focus:border-pink text-sm";
  const ready = !item.needs_shipping || (ship.name.trim() && ship.address.trim() && ship.email.trim());

  const go = () => askConfirm(`Spend ⭐ ${item.cost_points.toLocaleString()} points on ${item.name}${option ? ` (${option})` : ""}?`, async () => {
    setBusy(true);
    const r = await redeem(item, option || null, ship);
    setBusy(false);
    toast(r);
    if (r.ok) onClose();
  }, { yes: "Redeem" });

  return (
    <Modal open onClose={onClose}>
      <h3 className="font-pixel text-xs mb-1" style={{ color: "var(--gold)" }}>REDEEM</h3>
      <p className="text-sm mb-4">{item.emoji} {item.name} · <b style={{ color: "var(--gold)" }}>⭐ {item.cost_points.toLocaleString()}</b></p>
      {item.options.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-fg mb-1">Choose one</div>
          <div className="flex flex-wrap gap-2">
            {item.options.map((o) => (
              <button key={o} onClick={() => setOption(o)} className={`px-3 py-1.5 rounded border text-sm ${option === o ? "border-pink text-pink" : "border-line"}`}>{o}</button>
            ))}
          </div>
        </div>
      )}
      {item.needs_shipping ? (
        <div className="space-y-2 mb-4">
          <label className="block text-xs text-muted-fg">Full name<input className={input} autoComplete="name" value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} /></label>
          <label className="block text-xs text-muted-fg">Shipping address<textarea className={`${input} h-20`} autoComplete="street-address" value={ship.address} onChange={(e) => setShip({ ...ship, address: e.target.value })} placeholder={"Street, apt\nCity, State ZIP\nCountry"} /></label>
          <label className="block text-xs text-muted-fg">Email<input className={input} type="email" autoComplete="email" value={ship.email} onChange={(e) => setShip({ ...ship, email: e.target.value })} /></label>
          <label className="block text-xs text-muted-fg">Phone (optional, for delivery)<input className={input} type="tel" autoComplete="tel" value={ship.phone} onChange={(e) => setShip({ ...ship, phone: e.target.value })} /></label>
        </div>
      ) : (
        <label className="block text-xs text-muted-fg mb-4">Email for delivery<input className={input} type="email" value={ship.email} onChange={(e) => setShip({ ...ship, email: e.target.value })} /></label>
      )}
      <p className="text-[11px] text-muted-fg mb-4">Our team reviews every order before it ships. If we can't fulfil it, your points come back.</p>
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold flex-[2]" disabled={busy || !ready || (item.options.length > 0 && !option)} onClick={go}>{busy ? "Redeeming…" : "Redeem"}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- raffles

function timeLeft(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "Ended";
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function Raffles() {
  const { raffles, myTickets, points, loading, error } = useRewards();
  const session = useCloud((s) => s.session);
  const c = useGame((s) => s.career)!;
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 30_000); return () => window.clearInterval(t); }, []);
  if (!cloudConfigured) return <Unavailable />;
  const level = points?.level ?? c.peakLevel;
  const live = raffles.filter((r) => r.status === "open" && Date.parse(r.ends_at) > Date.now());
  const past = raffles.filter((r) => !live.includes(r)).slice(-5).reverse();

  return (
    <div>
      <p className="text-xs text-muted-fg mb-3">Spend points on tickets for a shot at something big. Every ticket is one chance, and there's a free entry every day.</p>
      {!session && <SignInNudge what="enter raffles" />}
      {error && <p className="text-xs text-danger mb-3">{error} <button className="underline" onClick={() => void loadRewards()}>Retry</button></p>}
      {loading && !raffles.length && <p className="text-sm text-muted-fg text-center py-6">Loading raffles…</p>}
      {!loading && !live.length && <p className="text-sm text-muted-fg text-center py-6">No raffle running right now. Check back soon.</p>}
      <p className="text-[10px] text-muted-fg mb-3">No purchase necessary. 18+ where offered; void where prohibited. Each raffle's official rules are in the app and the <a className="underline" href="https://tourstarapp.com/terms#raffles" target="_blank" rel="noreferrer">Terms</a>. Apple Inc. and Google LLC are not sponsors of, and are not involved in, any TourStar raffle or reward.</p>
      <div className="space-y-3">
        {live.map((r) => <RaffleCard key={r.id} r={r} level={level} mine={myTickets[r.id]} signedIn={!!session} />)}
      </div>
      {past.length > 0 && (
        <>
          <h3 className="font-pixel text-[9px] text-muted-fg mt-6 mb-2">PAST RAFFLES</h3>
          <ul className="space-y-1.5">
            {past.map((r) => (
              <li key={r.id} className="panel px-3 py-2 text-sm">
                <div className="flex justify-between gap-2"><span className="truncate">{r.emoji} {r.prize}</span><span className="text-[11px] text-muted-fg shrink-0">{r.status === "drawn" ? "Drawn" : "Closed"}</span></div>
                {r.status === "drawn" && r.winner_name && <div className="text-[11px] mt-0.5" style={{ color: "var(--gold)" }}>🏆 Winner: {r.winner_name}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-[10px] text-muted-fg mt-6 leading-relaxed">{RAFFLE_DISCLAIMER}</p>
    </div>
  );
}

function RaffleCard({ r, level, mine, signedIn }: { r: Raffle; level: number; mine?: { total: number; freeToday: boolean }; signedIn: boolean }) {
  const points = useRewards((s) => s.points);
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(false);
  const locked = level < r.min_level;
  const have = mine?.total ?? 0;
  const cap = r.max_tickets_per_user ? Math.max(0, r.max_tickets_per_user - have) : 100;
  const cost = n * r.ticket_cost;
  const balance = points?.balance ?? 0;

  const act = async (free: boolean) => {
    setBusy(true);
    toast(await enterRaffle(r, free ? 1 : n, free));
    setBusy(false);
  };

  return (
    <Card glow={locked ? undefined : "pink"} className={locked ? "opacity-60" : ""}>
      <div className="flex gap-3">
        {r.image_url ? <img src={r.image_url} alt="" className="w-16 h-16 rounded object-cover shrink-0" /> : <div className="text-4xl w-16 text-center shrink-0">{r.emoji}</div>}
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[9px]" style={{ color: "var(--neon-pink)" }}>{r.title.toUpperCase()}</div>
          <div className="font-bold text-sm mt-1">{r.prize}</div>
          {r.description && <p className="text-xs text-muted-fg mt-1">{r.description}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
            <span style={{ color: "var(--gold)" }}>⭐ {r.ticket_cost.toLocaleString()} / ticket</span>
            <span className="text-muted-fg">⏱ {timeLeft(r.ends_at)}</span>
            {have > 0 && <span style={{ color: "var(--electric)" }}>🎟️ You have {have}</span>}
          </div>
        </div>
      </div>

      {locked ? (
        <div className="mt-3 text-center"><Tag color="var(--gold)">🔒 OPENS AT LV{r.min_level} · {levelName(r.min_level).toUpperCase()}</Tag></div>
      ) : !signedIn ? null : (
        <div className="mt-3 space-y-2">
          {r.free_daily_entry && (
            <button className="btn btn-ghost w-full" disabled={busy || mine?.freeToday || cap < 1} onClick={() => act(true)}>
              {mine?.freeToday ? "✓ Today's free entry used" : "🎟️ Free daily entry"}
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded border border-line">
              <button className="w-9 h-10 text-lg disabled:opacity-30" disabled={n <= 1} onClick={() => setN(n - 1)} aria-label="Fewer tickets">−</button>
              <span className="w-8 text-center tabular-nums text-sm">{n}</span>
              <button className="w-9 h-10 text-lg disabled:opacity-30" disabled={n >= Math.min(cap, 100)} onClick={() => setN(n + 1)} aria-label="More tickets">+</button>
            </div>
            <button className="btn btn-pink flex-1" disabled={busy || cap < 1 || balance < cost}
              onClick={() => askConfirm(`Spend ⭐ ${cost.toLocaleString()} on ${n} ticket${n > 1 ? "s" : ""}?`, () => void act(false), { yes: "Enter" })}>
              {cap < 1 ? "Ticket limit reached" : balance < cost ? `Need ⭐ ${cost.toLocaleString()}` : `Buy ${n} · ⭐ ${cost.toLocaleString()}`}
            </button>
          </div>
        </div>
      )}
      <button className="text-[11px] underline text-muted-fg mt-3" onClick={() => setRules(!rules)}>{rules ? "Hide" : "Official"} rules</button>
      {rules && (
        <div className="text-[11px] text-muted-fg mt-2 whitespace-pre-line leading-relaxed">
          {r.rules || "Open to registered TourStar players. Ends at the time shown. One winner is drawn at random from all tickets after the raffle ends and contacted by email."}
          {"\n\n"}Ends {new Date(r.ends_at).toLocaleString()}.{r.prize_value_usd ? ` Approximate prize value: $${r.prize_value_usd.toLocaleString()}.` : ""}
          {"\n\n"}{RAFFLE_DISCLAIMER}{" "}<a className="underline" href="https://tourstarapp.com/terms">Full terms</a>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- shop (game cash boosts)

const CATS: StoreItem["category"][] = ["VIP", "Merch", "Records", "Tickets", "Wellness"];

function Shop() {
  const c = useGame((s) => s.career)!;
  const buy = useGame((s) => s.buy);
  const [cat, setCat] = useState<StoreItem["category"] | "All">("All");
  const lvl = levelFor(c.stats.fame).level;
  const items = STORE.filter((i) => cat === "All" || i.category === cat);

  return (
    <div>
      <PageTitle title="SHOP" sub="Spend game cash on boosts for your artist." right={<span className="font-pixel text-[10px]" style={{ color: "var(--success)" }}>{fmtMoney(c.stats.cash)}</span>} />
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 -mx-4 px-4">
        {(["All", ...CATS] as const).map((k) => (
          <button key={k} onClick={() => setCat(k)} className={`font-pixel text-[8px] px-3 py-2 rounded-full border shrink-0 ${cat === k ? "border-pink text-pink" : "border-line text-muted-fg"}`}>{k.toUpperCase()}</button>
        ))}
      </div>
      <div className="space-y-3">
        {items.map((i) => {
          const locked = lvl < i.level;
          return (
            <Card key={i.id} className={locked ? "opacity-50" : ""}>
              <div className="flex gap-3">
                <div className="text-3xl">{i.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-sm">{i.name}</div>
                    <Tag>{i.category}</Tag>
                  </div>
                  <p className="text-xs text-muted-fg mt-1">{i.blurb}</p>
                  <DeltaChips delta={i.effects} className="mt-2" />
                </div>
              </div>
              {locked ? (
                <div className="mt-3 text-center"><Tag color="var(--gold)">UNLOCKS AT LV{i.level}</Tag></div>
              ) : (
                <button className="btn btn-gold w-full mt-3" disabled={c.stats.cash < i.price} onClick={() => toast(buy(i.id))}>Buy · {fmtMoney(i.price)}</button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
