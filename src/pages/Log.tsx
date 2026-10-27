import { useState } from "react";
import { useGame } from "../game/store";
import type { LogType } from "../game/types";
import { Empty, PageTitle } from "../components/ui";

const ICON: Record<LogType, string> = { gig: "🎤", release: "💿", scandal: "🚨", milestone: "🏆", label: "🏷️", crew: "🧑‍🤝‍🧑", store: "🛍️", rival: "⚔️", event: "🎲", daily: "🎁", system: "📌" };
const FILTERS: { k: LogType | "all"; l: string }[] = [
  { k: "all", l: "All" }, { k: "gig", l: "Gigs" }, { k: "release", l: "Releases" }, { k: "scandal", l: "Scandals" }, { k: "milestone", l: "Milestones" },
];

export default function Log() {
  const log = useGame((s) => s.career!.log);
  const [f, setF] = useState<LogType | "all">("all");
  const items = log.filter((e) => f === "all" || e.type === f);
  return (
    <div>
      <PageTitle title="CAREER LOG" sub="Every gig, release, scandal and milestone." />
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 -mx-4 px-4">
        {FILTERS.map((x) => (
          <button key={x.k} onClick={() => setF(x.k)} className={`font-pixel text-[8px] px-3 py-2 rounded-full border shrink-0 ${f === x.k ? "border-pink text-pink" : "border-line text-muted-fg"}`}>{x.l.toUpperCase()}</button>
        ))}
      </div>
      {!items.length ? <Empty emoji="📜" text="Nothing here yet." /> : (
        <ol className="relative border-l border-line ml-3 space-y-4">
          {items.map((e) => (
            <li key={e.id} className="ml-5">
              <span className="absolute -left-3 w-6 h-6 rounded-full bg-card border border-line flex items-center justify-center text-xs">{ICON[e.type]}</span>
              <div className="text-sm">{e.text}</div>
              <div className="text-[10px] text-muted-fg mt-0.5">Week {e.week} · {new Date(e.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
