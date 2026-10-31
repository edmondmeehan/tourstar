// Career → Wealth: what to do with a fortune. A home that upgrades, businesses that pay off,
// your own label, homes in tour cities, giving back, and the lifestyle buys. Upkeep is charged daily.
import { useEffect, useState } from "react";
import { Card, PageTitle, Tag, askConfirm, toast } from "../components/ui";
import { useGame } from "../game/store";
import { fmtMoney, levelFor } from "../game/engine";
import { ASSETS, CHARITY_COOLDOWN_DAYS, HOMES, LABEL_ACTS, LUXURIES, charityCost, cityHomePrice, dailyUpkeep, homeOf, labelIncome, netWorth, ownsAsset } from "../game/economy";
import { CITIES, cityById } from "../game/cities";
import { sfx } from "../lib/fx";

const H = ({ children }: { children: React.ReactNode }) => <h2 className="font-pixel text-[10px] mt-6 mb-3" style={{ color: "var(--gold)" }}>{children}</h2>;

export default function Wealth() {
  const c = useGame((s) => s.career)!;
  const g = useGame();
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 30_000); return () => window.clearInterval(t); }, []);
  const lvl = Math.max(levelFor(c.stats.fame).level, c.peakLevel);
  const home = homeOf(c);
  const act = (r: { ok: boolean; message: string }) => { toast(r); if (r.ok) sfx("coin", "success"); };
  const buy = (label: string, price: number, fn: () => { ok: boolean; message: string }) =>
    askConfirm(`${label} for ${fmtMoney(price)}?`, () => act(fn()), { yes: "Buy" });
  const income = labelIncome(c);
  const charityLeft = (c.charityAt ?? 0) + CHARITY_COOLDOWN_DAYS * 864e5 - Date.now();
  const cityPrice = cityHomePrice(lvl);
  const [donation, setDonation] = useState(10_000);

  return (
    <div>
      <PageTitle title="WEALTH" sub="Fame pays. Here's what to do with it." />
      <Card glow="gold" className="mb-2">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><div className="text-[10px] text-muted-fg">NET WORTH</div><div className="font-bold text-lg" style={{ color: "var(--gold)" }}>{fmtMoney(netWorth(c))}</div></div>
          <div><div className="text-[10px] text-muted-fg">CASH</div><div className="font-bold text-lg">{fmtMoney(c.stats.cash)}</div></div>
          <div><div className="text-[10px] text-muted-fg">DAILY UPKEEP</div><div className="font-bold text-lg">{fmtMoney(dailyUpkeep(c))}</div></div>
        </div>
        <p className="text-[11px] text-muted-fg mt-3 text-center">Homes and businesses cost a little every day. Net worth counts what you own at 70% of what you paid. All game cash; nothing here costs real money.</p>
      </Card>

      <H>🏠 WHERE YOU LIVE</H>
      <Card className="mb-3">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{home.emoji}</span>
          <div className="flex-1"><div className="font-bold">{home.name}</div><div className="text-xs text-muted-fg">{home.blurb}{home.restBonus ? ` You recover health faster at home.` : ""}</div></div>
        </div>
      </Card>
      <div className="space-y-2">
        {HOMES.filter((h) => h.price > home.price).map((h) => {
          const cost = h.price - Math.round(home.price * 0.6);
          const locked = lvl < h.level;
          return (
            <Card key={h.id} className={locked ? "opacity-60" : ""}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{h.emoji}</span>
                <div className="flex-1 min-w-0"><div className="font-bold text-sm">{h.name}</div><div className="text-[11px] text-muted-fg">{h.blurb} Upkeep {fmtMoney(h.upkeep)}/day.</div></div>
                {locked ? <Tag color="var(--gold)">LV{h.level}</Tag>
                  : <button className="btn btn-gold !px-3 text-[10px]" disabled={c.stats.cash < cost} onClick={() => buy(`Move into the ${h.name}`, cost, () => g.buyHome(h.id))}>{fmtMoney(cost)}</button>}
              </div>
            </Card>
          );
        })}
      </div>

      <H>💼 BUSINESSES</H>
      <div className="space-y-2">
        {ASSETS.map((a) => {
          const own = ownsAsset(c, a.id), locked = lvl < a.level;
          return (
            <Card key={a.id} className={locked ? "opacity-60" : ""} glow={own ? "gold" : undefined}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{a.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{a.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--success)" }}>{a.perk}</div>
                  <div className="text-[11px] text-muted-fg">{a.blurb} Upkeep {fmtMoney(a.upkeep)}/day.</div>
                </div>
                {own ? <Tag color="var(--success)">OWNED</Tag> : locked ? <Tag color="var(--gold)">LV{a.level}</Tag>
                  : <button className="btn btn-gold !px-3 text-[10px]" disabled={c.stats.cash < a.price} onClick={() => buy(a.name, a.price, () => g.buyAsset(a.id))}>{fmtMoney(a.price)}</button>}
              </div>
            </Card>
          );
        })}
      </div>

      {ownsAsset(c, "imprint") && (
        <>
          <H>🏷️ YOUR LABEL</H>
          <Card glow="pink" className="mb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">Earning <b>{fmtMoney(income.perDay)}</b>/day · ready: <b style={{ color: "var(--success)" }}>{fmtMoney(income.pending)}</b>{income.full && <span className="block text-[11px]" style={{ color: "var(--neon-pink)" }}>Full. Collect it so it keeps earning.</span>}</div>
              <button className="btn btn-primary !px-3 text-[10px]" disabled={income.pending < 1} onClick={() => act(g.collectLabel())}>Collect</button>
            </div>
          </Card>
          <div className="space-y-2">
            {LABEL_ACTS.map((a) => {
              const signed = (c.labelActs ?? []).includes(a.id);
              return (
                <Card key={a.id}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{a.emoji}</span>
                    <div className="flex-1"><div className="font-bold text-sm">{a.name}</div><div className="text-[11px] text-muted-fg">Earns {fmtMoney(a.perDay)} a day (holds up to 2 days).</div></div>
                    {signed ? <Tag color="var(--success)">SIGNED</Tag>
                      : <button className="btn btn-gold !px-3 text-[10px]" disabled={c.stats.cash < a.price} onClick={() => buy(`Sign ${a.name}`, a.price, () => g.signAct(a.id))}>{fmtMoney(a.price)}</button>}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <H>🌍 HOMES ON THE ROAD</H>
      <Card>
        <p className="text-xs text-muted-fg mb-3">A place in a tour city: travel there costs no energy and you draw a little better there. {lvl < 3 ? "Unlocks at level 3." : `${fmtMoney(cityPrice)} each at your level.`}</p>
        {(c.cityHomes?.length ?? 0) > 0 && <p className="text-xs mb-2">You own: {c.cityHomes!.map((id) => cityById(id)?.name ?? id).join(", ")}</p>}
        {lvl >= 3 && (
          <div className="flex flex-wrap gap-2">
            {CITIES.filter((x) => x.region === "core" && x.id !== c.hometown && !(c.cityHomes ?? []).includes(x.id)).map((x) => (
              <button key={x.id} className="px-3 py-2 rounded-full border border-line text-xs" disabled={c.stats.cash < cityPrice} onClick={() => buy(`A place in ${x.name}`, cityPrice, () => g.buyCityHome(x.id))}>{x.name}</button>
            ))}
          </div>
        )}
      </Card>

      <H>💗 GIVING BACK</H>
      <Card className="mb-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🎗️</span>
          <div className="flex-1"><div className="font-bold text-sm">Benefit show</div><div className="text-[11px] text-muted-fg">Put on a show for music programs in your hometown. Big credibility, hype and fans. Once a week. Costs {fmtMoney(charityCost(levelFor(c.stats.fame).level))} and ⚡20.</div></div>
          <button className="btn btn-pink !px-3 text-[10px]" disabled={charityLeft > 0} onClick={() => act(g.charityShow())}>{charityLeft > 0 ? `${Math.ceil(charityLeft / 864e5)}d` : "Play it"}</button>
        </div>
      </Card>
      <Card>
        <div className="font-bold text-sm">Your foundation</div>
        <div className="text-[11px] text-muted-fg mb-2">Donate game cash for credibility (once a day). Given so far: {fmtMoney(c.donated ?? 0)}.</div>
        <div className="flex gap-2">
          <select className="flex-1 bg-black/40 border border-line rounded px-3 py-2 text-sm" value={donation} onChange={(e) => setDonation(Number(e.target.value))}>
            {[10_000, 100_000, 1_000_000, 10_000_000].map((n) => <option key={n} value={n}>{fmtMoney(n)}</option>)}
          </select>
          <button className="btn btn-primary !px-4" disabled={c.stats.cash < donation} onClick={() => act(g.donate(donation))}>Donate</button>
        </div>
      </Card>

      <H>✨ LIFESTYLE</H>
      <div className="space-y-2 mb-4">
        {LUXURIES.map((l) => {
          const own = (c.luxury ?? []).includes(l.id), locked = lvl < l.level;
          return (
            <Card key={l.id} className={locked ? "opacity-60" : ""}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{l.emoji}</span>
                <div className="flex-1"><div className="font-bold text-sm">{l.name}</div><div className="text-[11px] text-muted-fg">{l.blurb}</div></div>
                {own ? <Tag color="var(--success)">OWNED</Tag> : locked ? <Tag color="var(--gold)">LV{l.level}</Tag>
                  : <button className="btn btn-gold !px-3 text-[10px]" disabled={c.stats.cash < l.price} onClick={() => buy(l.name, l.price, () => g.buyLuxury(l.id))}>{fmtMoney(l.price)}</button>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
