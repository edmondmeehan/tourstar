import { Link } from "react-router-dom";
import { LABELS, RELEASES } from "../game/data";
import { fmtMoney, fmtNum } from "../game/engine";
import { useGame } from "../game/store";
import { Card, Empty, PageTitle, Tag } from "../components/ui";

export default function Releases() {
  const c = useGame((s) => s.career)!;
  if (!c.releases.length) return (<div><PageTitle title="RELEASES" /><Empty emoji="📀" text="Nothing dropped yet. Head to Album to record." /></div>);
  return (
    <div>
      <PageTitle title="RELEASES" sub={`${c.releases.length} drops · ${fmtNum(c.releases.reduce((a, r) => a + r.streams, 0))} total streams`} />
      <div className="space-y-2">
        {c.releases.map((r) => {
          const d = RELEASES.find((x) => x.kind === r.kind)!;
          const label = LABELS.find((l) => l.id === r.labelId);
          const qc = r.quality >= 75 ? "var(--success)" : r.quality >= 45 ? "var(--gold)" : "var(--danger)";
          return (
            <Card key={r.id} className="flex items-center gap-3">
              <div className="text-3xl">{d.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{r.title}</div>
                <div className="text-[11px] text-muted-fg">{d.name} · Week {r.week} · {label ? label.name : "Independent"}</div>
                <div className="text-[11px] mt-1">{fmtNum(r.streams)} streams · {fmtMoney(r.earnings)} · +{fmtNum(r.fansGained)} fans</div>
                <div className="flex gap-1 mt-1">
                  {r.songId && <Tag color="var(--electric)">IN LOCKER</Tag>}
                  {r.distributed?.length ? <Tag color="var(--success)">DISTRIBUTED</Tag> : null}
                </div>
              </div>
              <div className="text-center">
                <div className="font-pixel text-sm" style={{ color: qc }}>{r.quality}</div>
                <div className="font-pixel text-[7px] text-muted-fg mt-1">QUALITY</div>
              </div>
            </Card>
          );
        })}
      </div>
      <Link to="/distribute" className="btn btn-ghost w-full mt-4 block text-center">📡 Send to streaming services</Link>
    </div>
  );
}
