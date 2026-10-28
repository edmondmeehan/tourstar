// How to Play: a plain-language guide. Numbers come from the live game data so it never goes stale.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, PageTitle } from "../components/ui";
import { CREW, LABELS, RELEASES, TOURS } from "../game/data";
import { fmtMoney, fmtNum, levels } from "../game/engine";
import { useConfig } from "../game/config";
import { useAiFlags } from "../lib/ai";

function Section({ id, emoji, title, open, toggle, children }: { id: string; emoji: string; title: string; open: boolean; toggle: (id: string) => void; children: React.ReactNode }) {
  return (
    <Card className="mb-2 !p-0 overflow-hidden">
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => toggle(id)} aria-expanded={open}>
        <span className="text-xl">{emoji}</span>
        <span className="flex-1 font-bold text-sm">{title}</span>
        <span className="text-muted-fg text-xs">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="px-4 pb-4 text-sm leading-relaxed space-y-2 [&_b]:text-fg text-muted-fg">{children}</div>}
    </Card>
  );
}

export default function HowToPlay() {
  const [open, setOpen] = useState<string | null>("basics");
  const toggle = (id: string) => setOpen(open === id ? null : id);
  const regen = useConfig((s) => s.config.energyRegenSeconds);
  const bonusEnergy = useConfig((s) => s.config.bonusEnergyPerDay);
  const pointActs = useConfig((s) => s.config.pointActsPerDay);
  const aiMin = useAiFlags((s) => s.minLevel);
  const lv = levels();
  const fullBar = Math.round((regen * 100) / 60);

  return (
    <div>
      <PageTitle title="HOW TO PLAY" sub="From Mom's basement to the stadium. Tap a topic." />

      <Section id="basics" emoji="🎯" title="The goal" open={open === "basics"} toggle={toggle}>
        <p>Build a music career from <b>Basement Act</b> to <b>Legend</b>. Play shows, drop releases, hire a crew and sign with a label. <b>Fame</b> levels you up; <b>cash</b> pays for everything else.</p>
        <p>Each level unlocks bigger venues, releases, crew and rewards.</p>
      </Section>

      <Section id="energy" emoji="⚡" title="Energy and health" open={open === "energy"} toggle={toggle}>
        <p><b>Energy</b> is spent on shows and releases. It refills by itself: 1 point every {regen}s, so a full bar in about {fullBar} minutes. Check in a few times a day to keep it working.</p>
        <p>Energy drinks and resting add a little more, up to <b>{bonusEnergy}</b> extra a day.</p>
        <p><b>Health</b> drops with every show (more at bigger venues). If it hits zero you're sent to rehab and can't play for a while. Rest, a spa day, or Security on your crew keep you going.</p>
      </Section>

      <Section id="shows" emoji="🎤" title="Playing shows" open={open === "shows"} toggle={toggle}>
        <p>Pick a venue on <Link to="/tour" className="underline">Tour</Link>, build your setlist, then play the rhythm game: tap the notes as they hit the line. Your <b>grade</b> (S to D) sets how much cash and fame you earn.</p>
        <p><b>Setlist tips:</b> your opener and closer matter most, songs you play often become fan faves, and playing the fan request earns a bonus.</p>
        <p><b>Difficulty:</b> Easy pays a bit less, Hard pays 25% more cash and fame. Bigger venues have faster notes.</p>
        <p><b>Sellouts</b> fill the venue and give 1.5× fame. Your odds go up with Hype, fans and Pyro.</p>
        <p className="text-xs">Venues: {TOURS.map((t) => `${t.emoji} ${t.name} (LV${t.level})`).join(" · ")}</p>
      </Section>

      <Section id="stats" emoji="🔥" title="Hype, fame, credibility" open={open === "stats"} toggle={toggle}>
        <p><b>Fame</b> is your score. It levels you up.</p>
        <p><b>Hype</b> is how hot you are right now. Higher hype means bigger paydays and more fame from every show, but it fades over time, so keep playing and releasing.</p>
        <p><b>Credibility</b> makes your releases better. Selling out to sponsors or scandals costs it; integrity earns it.</p>
        <p><b>Relationships</b> drop when you're on the road too long. Time at home brings them back.</p>
      </Section>

      <Section id="levels" emoji="⭐" title="Levels" open={open === "levels"} toggle={toggle}>
        <ul className="space-y-1">{lv.map((l) => <li key={l.level}><b>{l.level}. {l.name}</b> · {fmtNum(l.fame)} fame</li>)}</ul>
        <p>Leveling up unlocks venues and releases and pays reward points.</p>
      </Section>

      <Section id="releases" emoji="💿" title="Releases and AI songs" open={open === "releases"} toggle={toggle}>
        <p>On <Link to="/album" className="underline">Album</Link>, drop a {RELEASES.map((r) => `${r.name} (LV${r.level})`).join(", ")}. Releases earn cash, fans and fame, and quality depends on your credibility and hype. Songs keep earning royalties you can collect later.</p>
        <p><b>Real AI songs:</b> your first one is free. Daily free AI recordings unlock at level {aiMin} (sign in required). VIP members and Studio Sessions can record at any level.</p>
        <p>AI songs play on <Link to="/radio" className="underline">TourStar Radio</Link>, and the best can make the <Link to="/distribute" className="underline">TourStar Monthly</Link> on real streaming services.</p>
      </Section>

      <Section id="crew" emoji="🧑‍🤝‍🧑" title="Crew and gear: do they make more money?" open={open === "crew"} toggle={toggle}>
        <p>Yes. Crew and gear <b>multiply</b> what every show earns, so they're worth the most at big venues.</p>
        <ul className="space-y-1">{CREW.map((x) => <li key={x.id}>{x.emoji} <b>{x.name}</b> ({fmtMoney(x.cost)}, LV{x.level}): {x.effect}</li>)}</ul>
        <p><b>What to buy first:</b> the Tour Bus (more shows per energy bar), then a Manager (more pay per show), then the Lighting Rig (faster level-ups). Pyro and Security pay off at arenas and stadiums.</p>
        <p>Higher tiers replace lower ones. On the <Link to="/management" className="underline">Crew</Link> screen each upgrade shows what it adds at your biggest venue.</p>
      </Section>

      <Section id="look" emoji="🧑‍🎤" title="Your look" open={open === "look"} toggle={toggle}>
        <p>Build your artist on <Link to="/look" className="underline">My Look</Link>: skin tone, build and hair color are always free, and you start with a full closet of free basics.</p>
        <p>More hair, outfits, shoes, accessories and instruments come from game cash, level-ups, Gold drops and artist packs, and real TourStar merch unlocks the matching in-game item. Your look shows on stage, at home and on the leaderboard. It never changes your stats.</p>
      </Section>

      <Section id="labels" emoji="🏷️" title="Record labels" open={open === "labels"} toggle={toggle}>
        <p>Labels boost your pay and fan growth but keep a share. Bigger labels pay a signing advance.</p>
        <ul className="space-y-1">{LABELS.map((l) => <li key={l.id}>{l.emoji} <b>{l.name}</b> (LV{l.level}): +{Math.round(l.boost * 100)}% boost, keeps {Math.round(l.share * 100)}% · net about {Math.round(((1 + l.boost) * (1 - l.share) - 1) * 100)}% more per show · {fmtMoney(l.advance)} advance</li>)}</ul>
      </Section>

      <Section id="events" emoji="⚠️" title="Temptations, scandals and scams" open={open === "events"} toggle={toggle}>
        <p>Life on tour throws choices at you: afterparties, sketchy "doctors," get-rich-quick coins, fake promoters, loan sharks and phishing DMs.</p>
        <p>The wild choice can buy a quick hit of hype, but it usually costs health, credibility or cash, and can land you in jail or rehab. The careful choice is always safe. A good manager and security make bad outcomes less likely.</p>
        <p><b>Real-life tip:</b> real promoters never charge you to play, real companies never ask for your password, and "guaranteed 10x" is never real.</p>
      </Section>

      <Section id="rewards" emoji="🎁" title="Reward points, raffles and real prizes" open={open === "rewards"} toggle={toggle}>
        <p>You earn <b>reward points</b> by playing: shows and releases (the first {pointActs} each day), quests, daily claims and level-ups. Spend them on real rewards and raffle tickets in the Store.</p>
        <p>Points and raffle tickets <b>can't be bought</b>. Everyone earns them the same way.</p>
      </Section>

      <Section id="premium" emoji="💎" title="Gold, packs and VIP" open={open === "premium"} toggle={toggle}>
        <p><b>Gold Records</b> buy limited packs in the Store: stage looks, app colors, dance moves, titles, badges and official artist packs (some with merch discounts and presale access).</p>
        <p><b>TourStar VIP</b> adds faster energy, monthly Gold, extra AI songs and presale codes. All optional, and none of it buys points or raffle entries.</p>
      </Section>

      <Section id="daily" emoji="📅" title="Daily habits" open={open === "daily"} toggle={toggle}>
        <p>Claim your daily reward (streaks grow it), finish your daily quests, spend your energy bar, collect royalties, and check the weekly chart in <Link to="/rivals" className="underline">Rivals</Link>.</p>
      </Section>

      <p className="text-[11px] text-muted-fg text-center mt-4">Questions? <a className="underline" href="https://tourstarapp.com/support">Support</a></p>
    </div>
  );
}
