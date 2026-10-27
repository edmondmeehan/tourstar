import { LABELS } from "../game/data";
import { fmtMoney, levelFor } from "../game/engine";
import { useGame } from "../game/store";
import { Card, PageTitle, Tag, toast, askConfirm } from "../components/ui";

export default function Label() {
  const c = useGame((s) => s.career)!;
  const { signLabel, leaveLabel } = useGame();
  const lvl = levelFor(c.stats.fame).level;

  return (
    <div>
      <PageTitle title="LABEL" sub="Labels boost your earnings and fan growth — and take a cut." />
      {c.labelId ? (
        <Card glow="gold" className="mb-4 flex items-center justify-between">
          <div className="text-sm">Signed to <b>{LABELS.find((l) => l.id === c.labelId)?.name}</b></div>
          <button className="btn btn-danger" onClick={() => askConfirm("Walk away from your label? You keep your credibility but lose the boost.", () => toast(leaveLabel()), { yes: "Leave label", danger: true })}>Leave</button>
        </Card>
      ) : (
        <Card className="mb-4 text-sm text-muted-fg">You're independent. 100% of the money, none of the muscle.</Card>
      )}
      <div className="space-y-3">
        {LABELS.map((l) => {
          const locked = lvl < l.level;
          const signed = c.labelId === l.id;
          const net = (1 + l.boost) * (1 - l.share);
          return (
            <Card key={l.id} glow={signed ? "gold" : undefined} className={locked ? "opacity-50" : ""}>
              <div className="flex items-start gap-3">
                <div className="text-3xl">{locked ? "🔒" : l.emoji}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-bold">{l.name}</div>
                    {locked && <Tag color="var(--gold)">LV{l.level}</Tag>}
                    {signed && <Tag color="var(--gold)">SIGNED</Tag>}
                  </div>
                  <p className="text-xs text-muted-fg mt-1">{l.blurb}</p>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div className="rounded bg-black/40 py-2"><div className="font-pixel text-[7px] text-muted-fg">BOOST</div><div className="text-sm mt-1" style={{ color: "var(--success)" }}>+{Math.round(l.boost * 100)}%</div></div>
                    <div className="rounded bg-black/40 py-2"><div className="font-pixel text-[7px] text-muted-fg">THEIR CUT</div><div className="text-sm mt-1" style={{ color: "var(--danger)" }}>{Math.round(l.share * 100)}%</div></div>
                    <div className="rounded bg-black/40 py-2"><div className="font-pixel text-[7px] text-muted-fg">ADVANCE</div><div className="text-sm mt-1" style={{ color: "var(--gold)" }}>{fmtMoney(l.advance)}</div></div>
                  </div>
                  <div className="text-[11px] text-muted-fg mt-2">Net earnings ×{net.toFixed(2)} · fans ×{(1 + l.boost * 0.5).toFixed(2)}</div>
                  {!locked && !signed && <button className="btn btn-primary w-full mt-3" onClick={() => toast(signLabel(l.id))}>Sign deal</button>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
