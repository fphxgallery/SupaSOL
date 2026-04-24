import { useState, useMemo } from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Button } from '../ui/Button';
import { useAiDecisions, useInvalidateAiDecisions } from '../../hooks/useAiDecisions';
import { clearAiDecisions, type AiDecisionLogEntry } from '../../api/bot';
import { timeAgo } from '../../utils/format';

type KindFilter = 'all' | 'entry' | 'exit';
type OutcomeFilter = 'all' | AiDecisionLogEntry['outcome'];

const OUTCOME_COLORS: Record<AiDecisionLogEntry['outcome'], string> = {
  buy: 'text-green',
  sell: 'text-red',
  hold: 'text-text-dim',
  veto: 'text-orange',
  'no-confirm': 'text-orange',
  advisory: 'text-blue',
  unavailable: 'text-text-dim',
};

function fmtPct(n: number | undefined): string {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

function fmtScore(n: number | undefined): string {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(2);
}

export function AiDecisionsPanel({ enabled }: { enabled: boolean }) {
  const { data } = useAiDecisions(enabled);
  const invalidate = useInvalidateAiDecisions();
  const [kind, setKind] = useState<KindFilter>('all');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');

  const decisions = data?.decisions ?? [];
  const filtered = useMemo(() => {
    return decisions.filter((d) => {
      if (kind !== 'all' && d.kind !== kind) return false;
      if (outcome !== 'all' && d.outcome !== outcome) return false;
      return true;
    });
  }, [decisions, kind, outcome]);

  async function handleClear() {
    if (!confirm('Clear AI decision log?')) return;
    await clearAiDecisions().catch(() => {});
    invalidate();
  }

  const kindOpts: { label: string; value: KindFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Entry', value: 'entry' },
    { label: 'Exit', value: 'exit' },
  ];
  const outcomeOpts: { label: string; value: OutcomeFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Buy', value: 'buy' },
    { label: 'Sell', value: 'sell' },
    { label: 'Hold', value: 'hold' },
    { label: 'Veto', value: 'veto' },
    { label: 'No-confirm', value: 'no-confirm' },
    { label: 'Advisory', value: 'advisory' },
    { label: 'Unavailable', value: 'unavailable' },
  ];

  return (
    <Card>
      <CardHeader
        title="AI Decisions"
        subtitle={enabled ? `${filtered.length} of ${decisions.length} shown · live tail` : 'Background bot not running'}
        action={decisions.length > 0 ? <Button variant="secondary" size="sm" onClick={handleClear}>Clear</Button> : undefined}
      />
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Kind</label>
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
              {kindOpts.map(({ label, value }) => (
                <button key={value} onClick={() => setKind(value)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${kind === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Outcome</label>
            <div className="flex flex-wrap gap-1 bg-surface-2 rounded-lg p-1 border border-border">
              {outcomeOpts.map(({ label, value }) => (
                <button key={value} onClick={() => setOutcome(value)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${outcome === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-text-dim text-center py-6">
            {enabled ? 'No AI decisions match filter' : 'Unlock bot with AI enabled to see decisions'}
          </p>
        ) : (
          <div className="overflow-y-auto divide-y divide-border/40 border border-border rounded-lg" style={{ maxHeight: '480px' }}>
            <div className="grid grid-cols-[70px_52px_90px_56px_80px_80px_1fr] gap-x-2 px-3 py-2 text-[10px] font-semibold text-text-dim uppercase tracking-wide bg-surface-2 sticky top-0">
              <span>Age</span>
              <span>Kind</span>
              <span>Token</span>
              <span className="text-right">Conf</span>
              <span className="text-right">Score</span>
              <span className="text-right">P&L</span>
              <span>Outcome / Reason</span>
            </div>
            {filtered.map((d) => {
              const color = OUTCOME_COLORS[d.outcome] ?? 'text-text';
              const gateBits = d.gate != null ? ` gate=${d.gate.toFixed(0)}` : '';
              const cachedBits = d.cached ? ' (cached)' : '';
              return (
                <div key={d.id} className="grid grid-cols-[70px_52px_90px_56px_80px_80px_1fr] gap-x-2 px-3 py-2 items-start text-xs">
                  <span className="text-[10px] text-text-dim tabular-nums">{timeAgo(d.ts)}</span>
                  <span className={`text-[10px] font-semibold uppercase ${d.kind === 'entry' ? 'text-green' : 'text-blue'}`}>{d.kind}</span>
                  <span className="text-text font-semibold truncate" title={d.mint}>{d.symbol}</span>
                  <span className="text-right font-mono tabular-nums text-text">{d.confidence}%</span>
                  <span className={`text-right font-mono tabular-nums ${d.composite != null && d.composite < 0 ? 'text-red' : d.composite != null && d.composite > 0 ? 'text-green' : 'text-text-dim'}`}>{fmtScore(d.composite)}</span>
                  <span className={`text-right font-mono tabular-nums ${d.pnlPct == null ? 'text-text-dim' : d.pnlPct >= 0 ? 'text-green' : 'text-red'}`}>{fmtPct(d.pnlPct)}</span>
                  <div className="min-w-0">
                    <span className={`text-[10px] font-semibold uppercase ${color}`}>{d.outcome}</span>
                    <span className="text-text-dim"> · {d.action}{cachedBits}{gateBits}</span>
                    <p className="text-text-dim break-words">{d.reason}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
