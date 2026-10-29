// AI press: Claude writes news stories after big career moments, critic reviews of every release, a weekly
// recap and manager advice. The server (ai-press) holds the API key and the daily caps; this file decides
// when to ask and keeps the player's feed.
import { create } from "zustand";
import { supabase, useCloud } from "./cloud";
import { useGame } from "../game/store";
import { CREW, LABELS, PERSONAS, RELEASES } from "../game/data";
import { levelFor } from "../game/engine";
import { drumChops } from "../game/drums";
import { useMyRank } from "./leaderboard";
import type { Career } from "../game/types";

export type PressKind = "story" | "review" | "recap" | "chat";
export interface PressItem {
  id: string; kind: PressKind; event: string; outlet: string; headline: string; body: string; created_at: string;
  meta: { score?: number; tips?: string[]; highlights?: string[]; suggestion?: string; q?: string };
}

interface PressState {
  enabled: boolean;
  items: PressItem[];
  loaded: boolean;
  /** Daily cap reached (stories pause until tomorrow). */
  capped: boolean;
  writing: number;
}
export const usePress = create<PressState>(() => ({ enabled: false, items: [], loaded: false, capped: false, writing: 0 }));

/** What Claude gets to know about the career: numbers and recent history, nothing personal. */
export function careerSnapshot(c: Career) {
  const lvl = levelFor(c.stats.fame);
  return {
    artist: c.name.slice(0, 40), genre: c.genre, persona: PERSONAS[c.persona]?.name ?? c.persona,
    level: lvl.level, levelName: lvl.name, week: c.week,
    stats: { fame: c.stats.fame, fans: c.stats.fans, cash: c.stats.cash, hype: c.stats.hype, credibility: c.stats.credibility, health: c.stats.health, relationships: c.stats.relationships, energy: c.stats.energy },
    label: LABELS.find((l) => l.id === c.labelId)?.name ?? "unsigned",
    crew: CREW.filter((x) => c.crew[x.id]).map((x) => x.name),
    totals: c.totals,
    drumChopsPct: drumChops(c.drums?.best),
    samplesInCrate: (c.samples ?? []).length,
    recentReleases: c.releases.slice(0, 3).map((r) => ({ kind: RELEASES.find((x) => x.kind === r.kind)?.name ?? r.kind, title: r.title, quality: r.quality, streams: r.streams })),
    weeklyRank: useMyRank.getState().rank,
    recentEvents: c.log.slice(0, 8).map((l) => l.text),
  };
}

async function call(body: Record<string, unknown>): Promise<{ item?: PressItem; limit?: boolean; disabled?: boolean; error?: string }> {
  if (!supabase || !useCloud.getState().session) return { error: "Sign in to get press coverage." };
  const { data, error } = await supabase.functions.invoke("ai-press", { body });
  if (error) {
    let msg = "The newsroom is busy. Try again.";
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* keep default */ }
    return { error: msg };
  }
  return data as { item?: PressItem; limit?: boolean; disabled?: boolean };
}

function addItem(it: PressItem) {
  const items = usePress.getState().items.filter((x) => x.id !== it.id);
  usePress.setState({ items: [it, ...items].slice(0, 80) });
}

export async function requestPress(kind: PressKind, event: string, extra: Record<string, unknown> = {}) {
  const c = useGame.getState().career;
  if (!c || !usePress.getState().enabled) return { error: "The press isn't covering TourStar yet." };
  usePress.setState((s) => ({ writing: s.writing + 1 }));
  try {
    const r = await call({ kind, event, career: careerSnapshot(c), ...extra });
    if (r.disabled) usePress.setState({ enabled: false });
    if (r.limit && kind !== "chat") usePress.setState({ capped: true });
    if (r.item) addItem(r.item);
    return r;
  } finally {
    usePress.setState((s) => ({ writing: Math.max(0, s.writing - 1) }));
  }
}

export async function loadPress() {
  if (!supabase || !useCloud.getState().session) { usePress.setState({ items: [], loaded: true }); return; }
  const { data } = await supabase.from("ai_press").select("*").order("created_at", { ascending: false }).limit(80);
  usePress.setState({ items: (data ?? []) as PressItem[], loaded: true });
}

async function refreshEnabled() {
  if (!supabase) return;
  const { data } = await supabase.from("app_public_config").select("value").eq("key", "press_enabled").maybeSingle();
  usePress.setState({ enabled: data?.value === "true" });
}

/** Monday 00:00 UTC of this week, as the recap's key. */
export const weekKey = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- automatic coverage

const queue: { kind: PressKind; event: string; key?: string }[] = [];
let busy = false;
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length && !usePress.getState().capped && usePress.getState().enabled) {
    const job = queue.shift()!;
    await requestPress(job.kind, job.event, job.key ? { key: job.key } : {});
    await new Promise((r) => setTimeout(r, 4000));
  }
  busy = false;
}
function enqueue(kind: PressKind, event: string, key?: string) {
  if (!usePress.getState().enabled || !useCloud.getState().session || usePress.getState().capped) return;
  if (queue.length >= 4) queue.shift(); // keep only the freshest moments
  queue.push({ kind, event, key });
  void pump();
}

/** Turn career changes into press: reviews for releases, stories for big moments. */
function watch(next: Career | null, prev: Career | null) {
  if (!next || !prev || next.id !== prev.id) return;
  const r = next.releases[0];
  if (r && r.id !== prev.releases[0]?.id) {
    const kind = RELEASES.find((x) => x.kind === r.kind)?.name ?? r.kind;
    enqueue("review", `${kind} "${r.title}": quality ${r.quality}/100, ${r.streams.toLocaleString()} first-week streams, ${r.fansGained.toLocaleString()} new fans.`, `release:${r.id}`);
  }
  const latest = next.log[0]?.text ?? "";
  const lv = levelFor(next.stats.fame).level, plv = levelFor(prev.stats.fame).level;
  if (lv > plv && lv > (prev.peakLevel ?? 0)) enqueue("story", `Leveled up to level ${lv}, ${levelFor(next.stats.fame).name}.`);
  else if (next.totals.sellouts > prev.totals.sellouts) enqueue("story", `Sold-out show. ${latest}`);
  else if (next.totals.scandals > prev.totals.scandals) enqueue("story", `Scandal: ${latest}`);
  else if (next.totals.beefs > prev.totals.beefs) enqueue("story", `Started a public beef. ${latest}`);
  else if (next.totals.collabs > prev.totals.collabs) enqueue("story", `New collaboration. ${latest}`);
  else if (next.labelId && next.labelId !== prev.labelId) enqueue("story", `Signed to ${LABELS.find((l) => l.id === next.labelId)?.name ?? "a label"}. ${latest}`);
  else if (next.lockout && !prev.lockout) enqueue("story", `Off the road: ${next.lockout.reason ?? latest}`);
  else if (next.totals.gigs === 1 && prev.totals.gigs === 0) enqueue("story", `First ever show. ${latest}`);
}

/** Once a week, after Monday: the weekly recap. */
async function maybeRecap() {
  const c = useGame.getState().career;
  if (!c || !usePress.getState().enabled || !useCloud.getState().session) return;
  const wk = weekKey();
  if (usePress.getState().items.some((x) => x.kind === "recap" && x.event === `recap:${wk}`)) return;
  if (c.totals.gigs < 3) return; // nothing to recap yet
  const rank = useMyRank.getState();
  await requestPress("recap", `Week of ${wk}. Weekly leaderboard rank: ${rank.rank ?? "unranked"}${rank.pct ? ` (top ${Math.max(1, Math.round(100 - rank.pct))}%)` : ""}. Recent moments: ${c.log.slice(0, 10).map((l) => l.text).join(" | ")}`, { key: `recap:${wk}` });
}

let started = false;
export function startPress() {
  if (started || !supabase) return;
  started = true;
  const boot = async () => { await refreshEnabled(); await loadPress(); void maybeRecap(); };
  void boot();
  useCloud.subscribe((s, p) => { if (s.session?.user.id !== p.session?.user.id) { usePress.setState({ capped: false }); void boot(); } });
  useGame.subscribe((s, p) => watch(s.career, p.career));
  window.setInterval(() => void refreshEnabled(), 10 * 60_000);
}
