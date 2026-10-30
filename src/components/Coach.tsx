// First-time tutorial: "Mo", the player's manager, walks them through their first show and release.
import { useEffect } from "react";
import { moLineUrl, playClip, type ClipHandle } from "../lib/ai";
import { useLocation, useNavigate } from "react-router-dom";
import { useGame } from "../game/store";
import { useConcert } from "../concert/useConcert";
import { sfx } from "../lib/fx";

/** Which bottom-nav tab to pulse for a tutorial step. */
export function coachTarget(step: number | undefined) {
  return step === 1 ? "/tour" : step === 4 ? "/album" : null;
}

export default function Coach() {
  const c = useGame((s) => s.career);
  const setTutorial = useGame((s) => s.setTutorial);
  const pendingEvent = useGame((s) => s.career?.pendingEvent);
  const celebrating = useGame((s) => s.celebrations.length > 0);
  const concert = useConcert((s) => s.open);
  const { pathname } = useLocation();
  const nav = useNavigate();
  const step = c?.tutorial?.step;

  // Route-driven steps.
  useEffect(() => {
    if (step === 1 && pathname === "/tour") setTutorial(2);
    if (step === 4 && pathname === "/album") setTutorial(5);
  }, [step, pathname, setTutorial]);

  const hidden = !c || step === undefined || c.tutorial === null || !!concert || !!pendingEvent || celebrating;

  // Mo says each line out loud (AI voice) when voices are switched on.
  useEffect(() => {
    if (hidden || step === undefined) return;
    let clip: ClipHandle | null = null;
    let live = true;
    void moLineUrl(Math.min(step, 6)).then((url) => { if (url && live) clip = playClip(url); });
    return () => { live = false; clip?.stop(); };
  }, [hidden, step]);

  if (hidden) return null;

  const skip = () => setTutorial(null);
  const next = (n: number | null) => { sfx("click"); setTutorial(n); };

  let body: React.ReactNode = null;
  let action: React.ReactNode = null;
  switch (step) {
    case 0:
      body = <>Hey <b>{c.name}</b>! I'm Mo, your new manager. Right now you're playing to Mom's laundry. Let's change that.</>;
      action = <button className="btn btn-pink text-[10px] px-4 py-2" onClick={() => next(1)}>Let's go</button>;
      break;
    case 1:
      body = <>First stop: your first gig. Tap <b>Tour</b> down below.</>;
      break;
    case 2:
      body = c.totals.gigs === 0
        ? <>Hey <b>{c.name}</b>, I'm Mo, your manager. Let's get you on stage right now: the <b>Open Mic</b> is free. Tap <b>▶ Hit the road</b>, then <b>Go on stage</b>. When the notes hit the line, tap!</>
        : <>The <b>Open Mic</b> is free. Tap <b>▶ Hit the road</b>, pick your songs, then go on stage. When the notes hit the line, tap!</>;
      break;
    case 3:
      body = <>The crowd's waiting. Get back on stage and finish your show.</>;
      break;
    case 4:
      body = <>That's your first show! 🎉 You earned <b style={{ color: "var(--gold)" }}>⭐ points</b>. Save them for real merch and VIP prizes in the Store. Now let's make music: tap <b>Album</b>.</>;
      break;
    case 5:
      body = <>Drop a free <b>Mixtape</b> (or a Single for $200). Every release joins your setlist <i>and</i> earns royalties while you're away.</>;
      break;
    default:
      body = <>You're officially an artist. Every day: claim your <b>daily reward</b>, finish <b>3 quests</b> and collect <b>royalties</b>. Want the full playbook? It's in <b>☰ → How to Play</b> any time.</>;
      action = (
        <div className="flex gap-2">
          <button className="btn btn-ghost text-[10px] px-3 py-2" onClick={() => { next(null); nav("/how-to-play"); }}>How to Play</button>
          <button className="btn btn-gold text-[10px] px-4 py-2" onClick={() => next(null)}>Let's go +25 ⭐</button>
        </div>
      );
  }

  return (
    <div className="fixed inset-x-0 z-[45] px-3 pointer-events-none" style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}>
      <div className="max-w-md mx-auto panel p-3 pointer-events-auto animate-pop flex gap-3 items-start" style={{ borderColor: "var(--gold)", borderWidth: 2, boxShadow: "0 10px 40px #000a" }} role="status" aria-live="polite">
        <div className="text-3xl leading-none shrink-0" aria-hidden="true">🧢</div>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[8px] mb-1" style={{ color: "var(--gold)" }}>MO · YOUR MANAGER</div>
          <p className="text-sm leading-snug">{body}</p>
          <div className="flex items-center justify-between mt-2 gap-2">
            <button className="text-[11px] text-muted-fg underline" onClick={skip}>Skip tutorial</button>
            {action}
          </div>
        </div>
      </div>
    </div>
  );
}
