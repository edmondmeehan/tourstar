// Admin → Leaderboard: who's on top, remove cheaters, set weekly rewards, see past winners.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/cloud";
import { askConfirm, toast } from "../components/ui";
import { GENRES } from "../game/data";
import { Section, fail, input } from "./kit";

interface Row { user_id: string; name: string; email: string | null; level: number; genre: string | null; fame: number; score: number; flagged: boolean; banned: boolean; ban_reason: string | null }
interface Winner { week: string; rank: number; name: string; score: number; gold: number; email: string | null }
const KEYS = ["lb_rewards_enabled", "lb_gold_top1", "lb_gold_top3", "lb_gold_top10", "lb_week_cap"] as const;

export function LeaderboardTab() {
  const [board, setBoard] = useState<"week" | "all">("week");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setRows(null);
    const [r, c] = await Promise.all([
      supabase!.rpc("admin_leaderboard", { p_board: board }),
      supabase!.from("app_public_config").select("key, value").in("key", KEYS as unknown as string[]),
    ]);
    if (r.error) { setRows([]); return fail(r.error.message.includes("admin_leaderboard") ? { message: "Run SQL-7-LEADERBOARD.sql in Supabase to turn on the leaderboard." } : r.error); }
    setRows(r.data.rows as Row[]);
    setWinners(r.data.winners as Winner[]);
    const m = Object.fromEntries((c.data ?? []).map((x) => [x.key, String(x.value)]));
    setCfg(m); setDraft(m);
  }, [board]);
  useEffect(() => { void load(); }, [load]);

  const ban = (r: Row) => {
    if (r.banned) return askConfirm(`Put ${r.name} back on the leaderboard?`, async () => {
      const { error } = await supabase!.rpc("admin_leaderboard_ban", { p_user: r.user_id, p_ban: false, p_reason: "" });
      if (error) return fail(error);
      void load();
    }, { yes: "Restore" });
    askConfirm(`Remove ${r.name} from all leaderboards? They can still play, but won't rank or win weekly rewards.`, async () => {
      const { error } = await supabase!.rpc("admin_leaderboard_ban", { p_user: r.user_id, p_ban: true, p_reason: "Removed by admin" });
      if (error) return fail(error);
      toast({ ok: true, message: `${r.name} is off the leaderboard.` });
      void load();
    }, { yes: "Remove", danger: true });
  };

  const save = async () => {
    for (const k of KEYS.filter((k) => k !== "lb_rewards_enabled")) if (!(Number(draft[k]) >= 0)) return toast({ ok: false, message: "Enter whole numbers (0 or more)." });
    const rowsToSave = KEYS.map((k) => ({ key: k, value: k === "lb_rewards_enabled" ? (draft[k] ?? "true") : String(Math.round(Number(draft[k]))), updated_at: new Date().toISOString() }));
    const { error } = await supabase!.from("app_public_config").upsert(rowsToSave);
    if (error) return fail(error);
    toast({ ok: true, message: "Saved. Applies from the next weekly payout." });
    void load();
  };
  const dirty = KEYS.some((k) => (draft[k] ?? "") !== (cfg[k] ?? ""));

  return (
    <>
      <Section title="Leaderboard" sub="Signed-in players ranked by fame gained this week (resets Monday 00:00 UTC) or total fame. Accounts flagged by the points checks and players you remove don't appear. Weekly gains above the cap are left off as likely cheating."
        right={<div className="flex gap-2">{(["week", "all"] as const).map((b) => <button key={b} className={`btn ${board === b ? "btn-pink" : "btn-ghost"} text-xs`} onClick={() => setBoard(b)}>{b === "week" ? "This week" : "All-time"}</button>)}</div>}>
        {!rows ? <p className="text-sm text-muted-fg">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-fg text-center py-6">No players yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px] [&_th]:px-2 [&_td]:px-2">
              <thead className="text-[11px] uppercase tracking-wider text-muted-fg text-left">
                <tr className="border-b border-line"><th className="py-2">#</th><th>Artist</th><th>Player</th><th>Level</th><th className="text-right">{board === "week" ? "Fame this week" : "Fame"}</th><th>Status</th><th /></tr>
              </thead>
              <tbody>{rows.map((r, i) => {
                const overCap = board === "week" && r.score > Number(cfg.lb_week_cap || 5000000);
                return (
                  <tr key={r.user_id} className={`border-b border-line/50 ${r.banned || r.flagged ? "opacity-60" : ""}`}>
                    <td className="py-2 tabular-nums text-muted-fg">{i + 1}</td>
                    <td>{GENRES[r.genre as keyof typeof GENRES]?.emoji ?? "🎵"} {r.name}</td>
                    <td className="text-xs text-muted-fg">{r.email}</td>
                    <td className="text-xs">LV{r.level}</td>
                    <td className={`text-right tabular-nums ${overCap ? "text-danger" : ""}`}>{r.score.toLocaleString()}</td>
                    <td className="text-xs">{r.banned ? "Removed" : r.flagged ? "Flagged (points)" : overCap ? "Over cap" : "Ranked"}</td>
                    <td className="text-right"><button className={`text-xs underline ${r.banned ? "" : "text-danger"}`} onClick={() => ban(r)}>{r.banned ? "Restore" : "Remove"}</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section title="Weekly rewards" sub="Paid automatically the first time anyone opens the game after the week resets. Winners also get a badge (and #1–3 a title).">
          <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={(draft.lb_rewards_enabled ?? "true") === "true"} onChange={(e) => setDraft({ ...draft, lb_rewards_enabled: String(e.target.checked) })} />Give weekly rewards</label>
          <div className="grid grid-cols-3 gap-2">
            {([["lb_gold_top1", "#1 Gold"], ["lb_gold_top3", "#2–3 Gold"], ["lb_gold_top10", "#4–10 Gold"]] as const).map(([k, l]) => (
              <label key={k} className="block text-xs text-muted-fg">{l}<input type="number" min={0} className={`${input} mt-1`} value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} /></label>
            ))}
          </div>
          <label className="block text-xs text-muted-fg mt-3">Most fame a player can gain in a week before they're left off (likely cheating)
            <input type="number" min={0} step={100000} className={`${input} mt-1`} value={draft.lb_week_cap ?? ""} onChange={(e) => setDraft({ ...draft, lb_week_cap: e.target.value })} /></label>
          <button className="btn btn-pink mt-4" disabled={!dirty} onClick={() => void save()}>Save</button>
        </Section>

        <Section title="Past winners" sub="Last 8 weeks.">
          {winners.length === 0 ? <p className="text-sm text-muted-fg">No weeks paid out yet.</p> : (
            <ul className="space-y-1 text-sm">{winners.map((w) => (
              <li key={`${w.week}-${w.rank}`} className="flex gap-2"><span className="text-muted-fg w-24 text-xs">{new Date(w.week + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span className="w-8">#{w.rank}</span><span className="flex-1 truncate">{w.name} <span className="text-muted-fg text-xs">{w.email}</span></span><span className="tabular-nums text-xs">{w.score.toLocaleString()} · 💿{w.gold}</span></li>
            ))}</ul>
          )}
        </Section>
      </div>
    </>
  );
}
