// tourstarapp.com splash page. Vanilla TS (no React) so it loads fast; reuses the game's synth
// so the demo plays a real TourStar song.
import { inject } from "@vercel/analytics";
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/permanent-marker/latin-400.css";
import "./landing.css";
import { makeMedley, playMedleyWith, type Medley, type MedleyHandle } from "../lib/synth";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];

const PINK = "#ff42d8", BLUE = "#1aa3ff", GOLD = "#f2c230";

// ================================================================= hero stage
function heroStage() {
  const canvas = $<HTMLCanvasElement>(".hero-stage");
  const ctx = canvas.getContext("2d")!;
  const beat = 60 / 118;
  type Fan = { x: number; row: number; phase: number; size: number; phone: boolean };
  let fans: Fan[] = [];
  let sparks: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
  let W = 0, H = 0, t = 0, last = performance.now(), visible = true, nextPyro = 4;

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fans = [];
    for (let row = 0; row < 6; row++) {
      const per = Math.round((W / 40) * (1 + row * 0.18));
      for (let i = 0; i < per; i++) fans.push({ x: (i + Math.random() * 0.7) / per, row, phase: Math.random() * 6.28, size: 0.8 + Math.random() * 0.45, phone: Math.random() < 0.16 });
    }
  };

  const burst = () => {
    for (const fx of [0.22, 0.78]) for (let i = 0; i < 46; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.1, sp = 220 + Math.random() * 320;
      sparks.push({ x: W * fx, y: H * 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.9 + Math.random() * 0.7, c: Math.random() < 0.5 ? GOLD : "#ff8033" });
    }
  };

  const draw = (dt: number) => {
    t += dt;
    const pulse = 1 - ((t / beat) % 1);
    const stageY = H * 0.52;
    // back wall
    const g = ctx.createLinearGradient(0, 0, 0, stageY);
    g.addColorStop(0, "#05040f"); g.addColorStop(1, "#2a0f45");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // LED wall
    const cols = Math.max(14, Math.round(W / 70)), rows = 6;
    const wx = W * 0.18, ww = W * 0.78, wy = H * 0.1, wh = H * 0.3;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const n = (Math.sin(i * 0.55 + t * 1.3) * Math.sin(j * 0.8 - t * 0.9) + 1) / 2;
      const on = n * (0.45 + pulse * 0.55);
      ctx.fillStyle = `rgba(255,66,216,${0.08 + on * 0.55})`;
      if ((i + j + Math.floor(t * 2)) % 7 === 0) ctx.fillStyle = `rgba(26,163,255,${0.1 + on * 0.5})`;
      ctx.fillRect(wx + (i * ww) / cols, wy + (j * wh) / rows, ww / cols - 4, wh / rows - 4);
    }
    // truss + beams
    ctx.fillStyle = "#3a3f58"; ctx.fillRect(W * 0.12, H * 0.055, W * 0.86, 6);
    const beams = 8;
    for (let i = 0; i < beams; i++) {
      const bx = W * (0.16 + (0.8 * i) / (beams - 1));
      const sweep = Math.sin(t * (0.7 + i * 0.12) + i) * W * 0.3;
      ctx.fillStyle = i % 2 ? `rgba(26,163,255,${0.12 + pulse * 0.06})` : `rgba(255,66,216,${0.12 + pulse * 0.06})`;
      ctx.beginPath(); ctx.moveTo(bx, H * 0.06); ctx.lineTo(bx + sweep - 50, H); ctx.lineTo(bx + sweep + 50, H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = i % 2 ? BLUE : PINK; ctx.beginPath(); ctx.arc(bx, H * 0.06, 5, 0, 6.28); ctx.fill();
    }
    // stage + performer
    ctx.fillStyle = "#1d1838"; ctx.fillRect(0, stageY, W, H * 0.05);
    ctx.fillStyle = PINK; ctx.fillRect(0, stageY, W, 3);
    const px = W * 0.62, bob = Math.abs(Math.sin((t * Math.PI) / beat)) * 9;
    ctx.fillStyle = `rgba(242,194,48,${0.12 + pulse * 0.08})`;
    ctx.beginPath(); ctx.moveTo(px, H * 0.06); ctx.lineTo(px - 60, stageY); ctx.lineTo(px + 60, stageY); ctx.fill();
    ctx.fillStyle = "#05030c";
    ctx.fillRect(px - 11, stageY - 54 - bob, 22, 36);
    ctx.fillRect(px - 11, stageY - 20 - bob / 2, 8, 20 + bob / 2); ctx.fillRect(px + 3, stageY - 20 - bob / 2, 8, 20 + bob / 2);
    ctx.beginPath(); ctx.arc(px, stageY - 66 - bob, 12, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "#05030c"; ctx.lineWidth = 7; ctx.lineCap = "round";
    const arm = -1.2 + Math.sin(t * 3) * 0.4;
    ctx.beginPath(); ctx.moveTo(px + 9, stageY - 48 - bob); ctx.lineTo(px + 9 + Math.cos(arm) * 28, stageY - 48 - bob + Math.sin(arm) * 28); ctx.stroke();
    // floor + crowd
    const floorTop = H * 0.6;
    ctx.fillStyle = "#07050f"; ctx.fillRect(0, stageY + H * 0.05, W, H);
    for (let row = 0; row < 6; row++) {
      const y = floorTop + (row * (H - floorTop)) / 5.4;
      const shade = 18 + row * 7;
      for (const f of fans) {
        if (f.row !== row) continue;
        const s = (12 + row * 5) * f.size;
        const jump = Math.max(0, Math.sin((t * Math.PI * 2) / beat + f.phase)) * s * 0.4;
        const x = f.x * W;
        ctx.fillStyle = `rgb(${shade},${10 + row * 3},${shade * 2})`;
        ctx.beginPath(); ctx.arc(x, y - jump, s * 0.45, 0, 6.28); ctx.fill();
        ctx.fillRect(x - s * 0.55, y - jump + s * 0.35, s * 1.1, s * 1.7);
        if (f.phase > 3) {
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = s * 0.2;
          ctx.beginPath(); ctx.moveTo(x + s * 0.4, y - jump + s * 0.4); ctx.lineTo(x + s * 0.75, y - jump - s * 0.6); ctx.stroke();
        }
        if (f.phone) { ctx.fillStyle = `rgba(255,255,217,${0.4 + Math.abs(Math.sin(t * 3 + f.phase)) * 0.6})`; ctx.fillRect(x + s * 0.7, y - jump - s * 0.8, 3, 5); }
      }
    }
    // pyro
    if (t > nextPyro) { burst(); nextPyro = t + 7 + Math.random() * 4; }
    for (const s of sparks) { s.vy += 300 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    sparks = sparks.filter((s) => s.life > 0);
    for (const s of sparks) { ctx.globalAlpha = Math.min(1, s.life); ctx.fillStyle = s.c; ctx.fillRect(s.x, s.y, 3, 3); }
    ctx.globalAlpha = 1;
  };

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (visible) draw(dt);
    requestAnimationFrame(loop);
  };
  resize();
  window.addEventListener("resize", resize);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  if (reduceMotion) { t = 1.2; draw(0); return; }
  requestAnimationFrame(loop);
}

// ================================================================= crowd counter
function crowdCounter() {
  const el = $<HTMLElement>(".crowd-num");
  const target = 60000, start = performance.now(), dur = reduceMotion ? 0 : 3200;
  const step = (now: number) => {
    const k = dur ? Math.min(1, (now - start) / dur) : 1;
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(target * e).toLocaleString();
    if (k < 1) requestAnimationFrame(step);
    else el.textContent = "60,000 · SOLD OUT";
  };
  window.setTimeout(() => requestAnimationFrame(step), 500);
}

// ================================================================= waitlist
async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_URL || !KEY) throw new Error("Signups aren't connected in this preview.");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && (data.message as string)) || "Something went wrong. Try again.");
  return data as T;
}

function showCount(n: number) {
  if (n < 100) return; // social proof only once it's meaningful
  const el = $<HTMLElement>(".fan-count");
  el.innerHTML = `<b>${n.toLocaleString()}</b> fans already on the list`;
  el.hidden = false;
}

function waitlist() {
  const params = new URLSearchParams(location.search);
  const source = params.get("utm_source") || params.get("ref") || "";
  const already = (() => { try { return localStorage.getItem("ts-waitlist"); } catch { return null; } })();

  const success = (form: HTMLFormElement) => {
    form.classList.add("done");
    form.innerHTML = `<div class="joined" role="status"><strong>YOU'RE ON THE LIST! 🎉</strong>We'll email you when TourStar hits the App Store, with your launch-day bonus.<br /><button type="button" class="btn btn-ghost btn-sm share">Tell a friend</button></div>`;
    $<HTMLButtonElement>(".share", form).addEventListener("click", async () => {
      const data = { title: "TourStar", text: "The music career game where you play every show. Get early access:", url: "https://tourstarapp.com/?ref=share" };
      try {
        if (navigator.share) await navigator.share(data);
        else { await navigator.clipboard.writeText(data.url); ($<HTMLButtonElement>(".share", form)).textContent = "Link copied!"; }
      } catch { /* dismissed */ }
    });
  };

  for (const form of $$<HTMLFormElement>("form.waitlist")) {
    if (already) { success(form); continue; }
    const input = $<HTMLInputElement>("input", form);
    const note = $<HTMLElement>(".form-note", form);
    const button = $<HTMLButtonElement>("button", form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
        input.setAttribute("aria-invalid", "true");
        note.textContent = "Enter a valid email address.";
        note.classList.add("error");
        input.focus();
        return;
      }
      input.removeAttribute("aria-invalid");
      note.classList.remove("error");
      button.disabled = true; button.textContent = "Joining…";
      try {
        const count = await rpc<number>("join_waitlist", { p_email: email, p_source: [form.dataset.source, source].filter(Boolean).join(":"), p_referrer: document.referrer || null });
        try { localStorage.setItem("ts-waitlist", "1"); } catch { /* private mode */ }
        $$<HTMLFormElement>("form.waitlist").forEach(success);
        showCount(count);
      } catch (err) {
        note.textContent = (err as Error).message;
        note.classList.add("error");
        button.disabled = false; button.textContent = "Get early access";
      }
    });
  }
  rpc<number>("waitlist_count", {}).then(showCount).catch(() => {});
}

// ================================================================= scroll effects
function scrollFx() {
  const nav = $<HTMLElement>(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.15 });
  $$(".reveal").forEach((el) => io.observe(el));

  // Ladder: light up levels one by one.
  const levels = $<HTMLElement>(".levels");
  const items = $$<HTMLElement>("li", levels);
  new IntersectionObserver(([e], obs) => {
    if (!e.isIntersecting) return;
    obs.disconnect();
    levels.style.setProperty("--fill", "100%");
    items.forEach((li, i) => window.setTimeout(() => li.classList.add("on"), reduceMotion ? 0 : 250 + i * 300));
  }, { threshold: 0.4 }).observe(levels);

  // Seamless ticker loop.
  const track = $<HTMLElement>(".ticker-track");
  track.innerHTML += track.innerHTML;
}

// ================================================================= playable demo
const PERFECT = 0.075, GOOD = 0.15, APPROACH = 1.35;
const LANE = [PINK, BLUE, GOLD];
const KEYS: Record<string, number> = { ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2, a: 0, s: 1, d: 2, j: 0, k: 1, l: 2 };

function demo() {
  const device = $<HTMLElement>(".demo-device");
  const canvas = $<HTMLCanvasElement>(".demo-canvas");
  const ctx = canvas.getContext("2d")!;
  const startEl = $<HTMLElement>(".demo-start"), endEl = $<HTMLElement>(".demo-end");
  const comboEl = $<HTMLElement>(".demo-combo"), scoreEl = $<HTMLElement>(".demo-score");
  let audioCtx: AudioContext | null = null;
  let music: MedleyHandle | null = null;
  let running = false;
  let cleanup: (() => void) | null = null;
  let round = 0;

  type Live = { t: number; lane: number; state: "open" | "hit" | "miss" };

  const play = () => {
    try { audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); void audioCtx.resume(); } catch { audioCtx = null; }
    const seeds = [[424242, 90210], [777001, 31337], [55555, 8086]][round++ % 3];
    const m: Medley = makeMedley(seeds, "pop", 0.25);
    music = playMedleyWith(audioCtx, 0.9, seeds, "pop", m);
    const now = music.now;
    const notes: Live[] = m.notes.map((n) => ({ t: n.t, lane: n.lane, state: "open" }));
    const flash = [-9, -9, -9];
    const pops: { text: string; c: string; lane: number; born: number }[] = [];
    const tally = { perfect: 0, good: 0, miss: 0, combo: 0, max: 0 };
    running = true;
    startEl.hidden = true; endEl.hidden = true;

    const judge = (n: Live, j: "perfect" | "good" | "miss") => {
      n.state = j === "miss" ? "miss" : "hit";
      tally[j] += 1;
      tally.combo = j === "miss" ? 0 : tally.combo + 1;
      tally.max = Math.max(tally.max, tally.combo);
      pops.push({ text: j.toUpperCase(), c: j === "perfect" ? GOLD : j === "good" ? BLUE : "#ff4d6d", lane: n.lane, born: now() });
      if (j !== "miss" && navigator.vibrate) navigator.vibrate(8);
    };
    const tap = (lane: number) => {
      if (!running) return;
      const t = now(); flash[lane] = t;
      let best: Live | null = null;
      for (const n of notes) {
        if (n.state !== "open" || n.lane !== lane) continue;
        const d = Math.abs(n.t - t);
        if (d <= GOOD && (!best || d < Math.abs(best.t - t))) best = n;
        if (n.t - t > GOOD) break;
      }
      if (best) judge(best, Math.abs(best.t - t) <= PERFECT ? "perfect" : "good");
    };
    const onPointer = (e: PointerEvent) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); tap(Math.max(0, Math.min(2, Math.floor(((e.clientX - r.left) / r.width) * 3)))); };
    const onKey = (e: KeyboardEvent) => {
      const lane = KEYS[e.key];
      if (lane === undefined || e.repeat) return;
      const r = device.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return; // only when the demo is on screen
      e.preventDefault(); tap(lane);
    };
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);

    let raf = 0;
    const frame = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const t = now(), lineY = H * 0.82, laneW = W / 3;
      for (const n of notes) if (n.state === "open" && t - n.t > GOOD) judge(n, "miss");

      for (let i = 0; i < 3; i++) {
        const x = i * laneW;
        ctx.fillStyle = "rgba(5,4,15,0.45)"; ctx.fillRect(x + 5, 0, laneW - 10, H);
        const lit = Math.max(0, 1 - (t - flash[i]) / 0.18);
        if (lit > 0) { ctx.fillStyle = LANE[i] + Math.round(lit * 80).toString(16).padStart(2, "0"); ctx.fillRect(x + 5, lineY - H * 0.32, laneW - 10, H * 0.32 + 8); }
        ctx.strokeStyle = LANE[i]; ctx.lineWidth = 3; ctx.globalAlpha = 0.55 + lit * 0.45;
        ctx.beginPath(); ctx.roundRect(x + laneW * 0.16, lineY - 14, laneW * 0.68, 28, 14); ctx.stroke(); ctx.globalAlpha = 1;
      }
      for (const n of notes) {
        if (n.state === "hit") continue;
        const dt = n.t - t;
        if (dt > APPROACH || dt < -0.4) continue;
        const y = lineY - (dt / APPROACH) * lineY, x = n.lane * laneW + laneW / 2, s = 0.75 + (1 - dt / APPROACH) * 0.25;
        ctx.globalAlpha = n.state === "miss" ? 0.25 : 1;
        ctx.fillStyle = LANE[n.lane]; ctx.shadowColor = LANE[n.lane]; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.roundRect(x - laneW * 0.3 * s, y - 11 * s, laneW * 0.6 * s, 22 * s, 11 * s); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillRect(x - laneW * 0.2 * s, y - 4 * s, laneW * 0.4 * s, 3 * s);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = "center"; ctx.font = "10px 'Press Start 2P', monospace";
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i], age = t - p.born;
        if (age > 0.6) { pops.splice(i, 1); continue; }
        ctx.globalAlpha = 1 - age / 0.6; ctx.fillStyle = p.c; ctx.fillText(p.text, p.lane * laneW + laneW / 2, lineY - 30 - age * 40);
      }
      ctx.globalAlpha = 1;
      const first = notes[0]?.t ?? 2;
      if (t < first - 0.1) {
        const left = Math.ceil((first - t) / (m.stepSec * 2));
        ctx.font = "26px 'Press Start 2P', monospace"; ctx.fillStyle = "#fff";
        ctx.fillText(left > 4 ? "READY" : String(Math.max(1, left)), W / 2, H * 0.42);
      }
      comboEl.textContent = tally.combo >= 3 ? `${tally.combo} COMBO` : "";
      const judged = tally.perfect + tally.good + tally.miss;
      scoreEl.textContent = judged ? `${Math.round(((tally.perfect + tally.good * 0.6) / judged) * 100)}%` : "";

      if (t > m.durationSec + 0.3) return finish(notes.length);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const finish = (total: number) => {
      running = false;
      cleanup?.();
      const acc = (tally.perfect + tally.good * 0.6) / Math.max(1, total);
      const grade = acc >= 0.88 ? "S" : acc >= 0.74 ? "A" : acc >= 0.55 ? "B" : acc >= 0.35 ? "C" : "D";
      const label = { S: "LEGENDARY SHOW", A: "CROWD WENT WILD", B: "SOLID SET", C: "ROUGH NIGHT", D: "TRAINWRECK" }[grade];
      const color = { S: GOLD, A: PINK, B: BLUE, C: "#a9a6c9", D: "#ff4d6d" }[grade];
      const g = $<HTMLElement>(".grade", endEl); g.textContent = grade; g.style.color = color;
      $<HTMLElement>(".grade-label", endEl).textContent = label;
      $<HTMLElement>(".grade-sub", endEl).textContent = grade === "S" || grade === "A"
        ? `${Math.round(acc * 100)}% · best combo ${tally.max}. Now picture 60,000 people singing it back.`
        : `${Math.round(acc * 100)}% · best combo ${tally.max}. Every legend bombed an open mic. Run it back?`;
      endEl.hidden = false;
      comboEl.textContent = ""; scoreEl.textContent = "";
    };

    cleanup = () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      music?.stop();
      cleanup = null;
    };
  };

  $<HTMLButtonElement>("button", startEl).addEventListener("click", play);
  $<HTMLButtonElement>(".demo-again", endEl).addEventListener("click", play);
  // Stop the music if they scroll away mid-show.
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting && running) { running = false; cleanup?.(); startEl.hidden = false; endEl.hidden = true; }
  }, { threshold: 0.1 }).observe(device);
  // Test hook for automated playtests.
  try { if (localStorage.getItem("ts-debug")) Object.assign(window, { __demo: { tap: (l: number) => window.dispatchEvent(new KeyboardEvent("keydown", { key: ["ArrowLeft", "ArrowDown", "ArrowRight"][l] })) } }); } catch { /* ignore */ }
}

heroStage();
crowdCounter();
waitlist();
scrollFx();
demo();

// Vercel Web Analytics (page views; no cookies).
inject();
