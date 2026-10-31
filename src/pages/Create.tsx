import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { nearestCity, parsePostal, savePostal, usePostal } from "../lib/postal";
import { CITIES, DEFAULT_HOMETOWN } from "../game/cities";
import { cloudConfigured, useCloud } from "../lib/cloud";
import { BASE_STATS, GENRES, PERSONAS } from "../game/data";
import { applyDelta } from "../game/engine";
import { useGame } from "../game/store";
import type { GenreId, PersonaId, Stats } from "../game/types";
import { HeroBackdrop, Logo } from "../components/HeroBackdrop";
import { SongGenerator, type Generation } from "../components/SongGenerator";
import { Card, StatBar, toast, askConfirm } from "../components/ui";
import { sfx } from "../lib/fx";

export default function Create() {
  const nav = useNavigate();
  const existing = useGame((s) => s.career);
  const createCareer = useGame((s) => s.createCareer);
  const session = useCloud((s) => s.session);
  const [name, setName] = useState("");
  const [genre, setGenre] = useState<GenreId>("pop");
  const [persona, setPersona] = useState<PersonaId>("underdog");
  const [home, setHome] = useState<string>("");
  const [zip, setZip] = useState<string>(usePostal.getState().postal ?? "");
  const place = zip.trim() ? parsePostal(zip) : null;
  const onZip = (v: string) => {
    setZip(v);
    const p = parsePostal(v);
    if (p) setHome(nearestCity(p, true).id);
  };
  const [theme, setTheme] = useState<{ seed: number; title: string } | null>(null);
  const [gens, setGens] = useState<Generation[]>([]);
  const [more, setMore] = useState(false);
  const [params] = useSearchParams();
  // A Legend retiring from the Hall of Fame starts a new career with a legacy bonus.
  const legacy = params.get("legacy") === "1" && !!existing && existing.peakLevel >= 7;

  const preview: Stats = applyDelta(applyDelta(BASE_STATS, PERSONAS[persona].mods), GENRES[genre].bonus);

  const submit = () => {
    if (name.trim().length < 2) return toast({ ok: false, message: "Give your artist a name (2+ characters)." });
    if (zip.trim() && !place) return toast({ ok: false, message: "Check your zip / postal code, or leave it blank." });
    const go = () => {
      if (place) void savePostal(place.postal);
      createCareer({ name, genre, persona, themeSeed: theme?.seed, legacy, hometown: home || DEFAULT_HOMETOWN[genre] });
      sfx("levelup");
      // New players go straight to their first stage; Mo takes it from there.
      nav(legacy ? "/dashboard" : "/tour");
    };
    if (legacy) go();
    else if (existing) askConfirm(`This replaces ${existing.name}'s career. Continue?`, go, { yes: "Start over", danger: true });
    else go();
  };

  return (
    <div className="min-h-screen max-w-md mx-auto relative">
      <div className="absolute inset-x-0 top-0 h-64 overflow-hidden"><HeroBackdrop dim /></div>
      <div className="relative z-10 px-4 pt-8 pb-16">
        <div className="flex justify-center mb-6"><Logo size="sm" /></div>
        <h1 className="font-pixel text-sm text-center mb-1 text-glow-pink" style={{ color: "var(--neon-pink)" }}>CREATE YOUR ARTIST</h1>
        <p className="text-center text-xs text-muted-fg mb-6">{legacy ? `${existing!.name} is in the Hall of Fame. Your next artist starts with a +${Math.min(50, ((existing!.legacy?.count ?? 0) + 1) * 10)}% fame bonus.` : "Every legend starts in Mom's basement."}</p>

        <Card className="mb-4">
          <label className="font-pixel text-[9px] text-muted-fg">STAGE NAME</label>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} placeholder="e.g. Lil Basement" className="w-full mt-2 px-3 py-3 rounded bg-black/50 border border-line outline-none focus:border-pink text-lg" />
        </Card>

        <Card className="mb-4">
          <div className="font-pixel text-[9px] text-muted-fg mb-3">GENRE</div>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(GENRES) as GenreId[]).map((g) => (
              <button key={g} onClick={() => { setGenre(g); sfx("click"); }} className={`rounded border p-2 text-center transition ${genre === g ? "border-pink bg-white/10 shadow-[var(--glow-pink)]" : "border-line"}`}>
                <div className="text-2xl">{GENRES[g].emoji}</div>
                <div className="text-[11px] mt-1">{GENRES[g].name}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-fg mt-3">{GENRES[genre].blurb}</p>
        </Card>

        <Card className="mb-4">
          <div className="font-pixel text-[9px] text-muted-fg mb-2">YOUR ZIP / POSTAL CODE <span className="normal-case">(optional)</span></div>
          <input value={zip} onChange={(e) => onZip(e.target.value.slice(0, 10))} placeholder="e.g. 10010, M5V 2T6 or SW1A 1AA" autoComplete="postal-code" inputMode="text"
            className="w-full px-3 py-3 rounded bg-black/50 border border-line outline-none focus:border-pink mb-1" />
          <p className="text-[11px] text-muted-fg mb-4">{place ? `📍 Near ${nearestCity(place).name}.` : "We use it to suggest your hometown and show real shows and presales near you."} Skip it if you like. You can change or remove it in Account.</p>
          <div className="font-pixel text-[9px] text-muted-fg mb-3">HOMETOWN</div>
          <select value={home || DEFAULT_HOMETOWN[genre]} onChange={(e) => setHome(e.target.value)} className="w-full px-3 py-3 rounded bg-black/50 border border-line outline-none focus:border-pink">
            {CITIES.filter((x) => x.region === "core").map((x) => <option key={x.id} value={x.id}>{x.name}{(x.taste[genre] ?? 1) > 1 ? ` ❤️ loves ${GENRES[genre].name}` : ""}</option>)}
          </select>
          <p className="text-xs text-muted-fg mt-2">Where your first fans are. Tour other cities to grow.</p>
        </Card>

        <button className="btn btn-primary w-full py-4 text-[11px] mb-3" onClick={submit}>▶ {legacy ? "Start the new career" : "Start career"}</button>
        {!more && <button className="w-full text-xs text-muted-fg underline mb-6" onClick={() => setMore(true)}>Customize persona and theme song (optional)</button>}
        {more && <>
        <Card className="mb-4">
          <div className="font-pixel text-[9px] text-muted-fg mb-3">PERSONA</div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PERSONAS) as PersonaId[]).map((p) => (
              <button key={p} onClick={() => { setPersona(p); sfx("click"); }} className={`rounded border p-2 text-center transition ${persona === p ? "border-electric bg-white/10 shadow-[var(--glow-blue)]" : "border-line"}`}>
                <div className="text-2xl">{PERSONAS[p].emoji}</div>
                <div className="text-[11px] mt-1 leading-tight">{PERSONAS[p].name}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-fg mt-3">{PERSONAS[persona].blurb}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
            {(["credibility", "hype", "health", "relationships"] as const).map((k) => <StatBar key={k} k={k} value={preview[k]} />)}
            <StatBar k="cash" value={preview.cash} />
            <StatBar k="fans" value={preview.fans} />
          </div>
        </Card>

        <Card className="mb-6">
          <div className="font-pixel text-[9px] text-muted-fg mb-1">THEME SONG (OPTIONAL)</div>
          <p className="text-xs text-muted-fg mb-3">{theme ? `Selected: "${theme.title}" — saved to your Locker.` : "Generate an anthem for your artist."}</p>
          <SongGenerator genre={genre} history={gens} setHistory={setGens} onGenerated={(seed, title) => setTheme({ seed, title })} />
        </Card>

        <button className="btn btn-primary w-full py-4 text-[11px]" onClick={submit}>▶ {legacy ? "Start the new career" : "Start career"}</button>
        </>}
        {cloudConfigured && !session && (
          <p className="text-center text-sm mt-5 text-muted-fg">
            Played before? <Link to="/login?mode=signin" className="underline text-electric">Sign in to load your career</Link>
          </p>
        )}
      </div>
    </div>
  );
}
