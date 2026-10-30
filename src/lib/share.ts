// Share cards: a 1080×1350 image (good for Instagram, TikTok, iMessage) for big moments: an S grade,
// a sellout, a level-up, a league promotion, the Hall of Fame. Uses the phone's share sheet when it can,
// otherwise downloads the image.
import { buildAvatar, GRID_H, GRID_W, normalizeLook } from "../game/looks";
import type { Career } from "../game/types";
import { levelFor } from "../game/engine";
import { track } from "./analytics";
import { toast } from "../components/ui";

export interface ShareSpec {
  kind: "show" | "level" | "league" | "hall" | "achievement" | "press";
  title: string;
  /** Big centerpiece: a grade letter or an emoji. */
  big: string;
  bigColor?: string;
  sub?: string;
  career: Career;
}

const W = 1080, H = 1350;

function loadImg(src: string) {
  return new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = t;
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}

export async function renderCard(s: ShareSpec): Promise<Blob | null> {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  await document.fonts?.ready?.catch(() => undefined);
  const pixel = "'Press Start 2P', monospace";

  // Night sky + neon grid floor
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#05040f"); g.addColorStop(0.55, "#1a0b35"); g.addColorStop(1, "#3a0f4a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,66,216,0.35)"; ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) { const y = 980 + i * i * 3.2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 30, 980); ctx.lineTo(W / 2 + i * 160, H); ctx.stroke(); }
  for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(255,255,255,${0.2 + ((i * 37) % 10) / 20})`; ctx.fillRect((i * 151) % W, (i * 89) % 900, 3, 3); }

  const logo = await loadImg("/brand/tourstar-logo.png");
  if (logo) { const lw = 620, lh = (logo.height / logo.width) * lw; ctx.drawImage(logo, (W - lw) / 2, 70, lw, lh); }

  ctx.textAlign = "center";
  ctx.fillStyle = "#f2c230";
  ctx.font = `34px ${pixel}`;
  wrap(ctx, s.title, W / 2, 330, 940, 50);

  // Centerpiece
  const isGrade = /^[SABCD]$/.test(s.big);
  ctx.font = isGrade ? `240px ${pixel}` : "220px system-ui, 'Apple Color Emoji', sans-serif";
  ctx.fillStyle = s.bigColor ?? "#ff42d8";
  ctx.shadowColor = s.bigColor ?? "#ff42d8"; ctx.shadowBlur = 50;
  ctx.fillText(s.big, W / 2, 640);
  ctx.shadowBlur = 0;

  if (s.sub) { ctx.font = "40px system-ui, sans-serif"; ctx.fillStyle = "#ffffff"; wrap(ctx, s.sub, W / 2, 740, 900, 52); }

  // The artist
  const look = normalizeLook(s.career.look, s.career.genre);
  const px = buildAvatar(look);
  const scale = 7, ax = W / 2 - (GRID_W * scale) / 2 - 170, ay = 900;
  for (const p of px) { ctx.fillStyle = p.c; ctx.fillRect(ax + p.x * scale, ay + p.y * scale, p.w * scale, p.h * scale); }
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff"; ctx.font = `36px ${pixel}`;
  ctx.fillText(s.career.name.toUpperCase().slice(0, 16), ax + GRID_W * scale + 40, ay + (GRID_H * scale) / 2 - 10);
  ctx.fillStyle = "#c9c3e6"; ctx.font = "34px system-ui, sans-serif";
  ctx.fillText(`Level ${levelFor(s.career.stats.fame).level} · ${levelFor(s.career.stats.fame).name}`, ax + GRID_W * scale + 40, ay + (GRID_H * scale) / 2 + 45);

  ctx.textAlign = "center"; ctx.fillStyle = "#ffffff"; ctx.font = `26px ${pixel}`;
  ctx.fillText("PLAY FREE · TOURSTARAPP.COM", W / 2, H - 70);

  return await new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
}

export async function shareCard(s: ShareSpec) {
  const blob = await renderCard(s);
  if (!blob) return toast({ ok: false, message: "Couldn't make the image on this device." });
  const file = new File([blob], `tourstar-${s.kind}.png`, { type: "image/png" });
  const text = `${s.title} — ${s.career.name} on TourStar. Play free: https://tourstarapp.com`;
  track("share", { kind: s.kind });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = file.name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast({ ok: true, message: "Image saved. Post it anywhere!" });
}
