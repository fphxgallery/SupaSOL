import { useState, useMemo } from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Button } from '../ui/Button';
import { useAiDecisions, useInvalidateAiDecisions } from '../../hooks/useAiDecisions';
import { clearAiDecisions, type AiDecisionLogEntry } from '../../api/bot';
import { timeAgo } from '../../utils/format';

type KindFilter = 'all' | 'entry' | 'exit';
type OutcomeFilter = 'all' | AiDecisionLogEntry['outcome'];
type ActionFilter = 'all' | AiDecisionLogEntry['action'];

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
  const [action, setAction] = useState<ActionFilter>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const decisions = data?.decisions ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return decisions.filter((d) => {
      if (kind !== 'all' && d.kind !== kind) return false;
      if (outcome !== 'all' && d.outcome !== outcome) return false;
      if (action !== 'all' && d.action !== action) return false;
      if (q) {
        if (
          !d.mint.toLowerCase().includes(q) &&
          !d.symbol.toLowerCase().includes(q) &&
          !d.reason.toLowerCase().includes(q) &&
          !d.action.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [decisions, kind, outcome, action, search]);

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
  const actionOpts: { label: string; value: ActionFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Buy', value: 'buy' },
    { label: 'Sell', value: 'sell' },
    { label: 'Hold', value: 'hold' },
    { label: 'Skip', value: 'skip' },
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
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="flex flex-col gap-1 min-w-[200px] flex-1">
            <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="mint, symbol, reason…"
              className="bg-surface-2 border border-border rounded-md px-3 py-1.5 text-xs text-text placeholder:text-text-dim focus:outline-none focus:border-green/60"
            />
          </div>
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
            <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Action</label>
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
              {actionOpts.map(({ label, value }) => (
                <button key={value} onClick={() => setAction(value)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${action === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
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
              const isOpen = expanded.has(d.id);
              const hasContext = d.marketSentiment || d.botPerformance;
              return (
                <div key={d.id}>
                  <div
                    className={`grid grid-cols-[70px_52px_90px_56px_80px_80px_1fr] gap-x-2 px-3 py-2 items-start text-xs ${hasContext ? 'cursor-pointer hover:bg-surface-2/50' : ''}`}
                    onClick={() => hasContext && toggle(d.id)}
                  >
                    <span className="text-[10px] text-text-dim tabular-nums">{timeAgo(d.ts)}</span>
                    <span className={`text-[10px] font-semibold uppercase ${d.kind === 'entry' ? 'text-green' : 'text-blue'}`}>{d.kind}</span>
                    <span className="text-text font-semibold truncate" title={d.mint}>{d.symbol}</span>
                    <span className="text-right font-mono tabular-nums text-text">{d.confidence}%</span>
                    <span className={`text-right font-mono tabular-nums ${d.composite != null && d.composite < 0 ? 'text-red' : d.composite != null && d.composite > 0 ? 'text-green' : 'text-text-dim'}`}>{fmtScore(d.composite)}</span>
                    <span className={`text-right font-mono tabular-nums ${d.pnlPct == null ? 'text-text-dim' : d.pnlPct >= 0 ? 'text-green' : 'text-red'}`}>{fmtPct(d.pnlPct)}</span>
                    <div className="min-w-0">
                      <span className={`text-[10px] font-semibold uppercase ${color}`}>{d.outcome}</span>
                      <span className="text-text-dim"> · {d.action}{cachedBits}{gateBits}</span>
                      {hasContext && <span className="text-text-dim text-[10px]"> · {isOpen ? '▾' : '▸'} ctx</span>}
                      <p className="text-text-dim break-words">{d.reason}</p>
                    </div>
                  </div>
                  {isOpen && hasContext && (
                    <div className="px-3 pb-3 pt-1 bg-surface-2/40 text-[11px] text-text-dim font-mono space-y-2">
                      {d.marketSentiment && (
                        <div>
                          <div className="text-[10px] uppercase font-semibold text-text-dim/70 mb-1">Market context (n={d.marketSentiment.sampleSize})</div>
                          <div>avg 6h: <span className={d.marketSentiment.avg6hPriceChange >= 0 ? 'text-green' : 'text-red'}>{fmtPct(d.marketSentiment.avg6hPriceChange)}</span> · avg 24h: <span className={d.marketSentiment.avg24hPriceChange >= 0 ? 'text-green' : 'text-red'}>{fmtPct(d.marketSentiment.avg24hPriceChange)}</span></div>
                          <div>6h net-buyer breadth: {d.marketSentiment.pctPositiveNetBuyers6h.toFixed(0)}% · avg organic: {d.marketSentiment.avgOrganicScore.toFixed(0)}</div>
                          <div>day: {d.marketSentiment.dayUtc} (UTC){d.marketSentiment.weekend ? ' · weekend' : ''}</div>
                        </div>
                      )}
                      {d.botPerformance && (
                        <div>
                          <div className="text-[10px] uppercase font-semibold text-text-dim/70 mb-1">Bot recent performance (last {d.botPerformance.closedCount})</div>
                          <div>W/L: {d.botPerformance.wins}/{d.botPerformance.losses} ({d.botPerformance.winRatePct.toFixed(0)}%) · avg pnl: <span className={d.botPerformance.avgPnlPct >= 0 ? 'text-green' : 'text-red'}>{fmtPct(d.botPerformance.avgPnlPct)}</span> · avg held: {d.botPerformance.avgHeldMinutes.toFixed(0)}m</div>
                          {d.botPerformance.streak.count >= 2 && (
                            <div>streak: <span className={d.botPerformance.streak.sign === 'win' ? 'text-green' : d.botPerformance.streak.sign === 'loss' ? 'text-red' : ''}>{d.botPerformance.streak.count} {d.botPerformance.streak.sign === 'win' ? 'wins' : d.botPerformance.streak.sign === 'loss' ? 'losses' : 'flat'}</span></div>
                          )}
                          {d.botPerformance.topExitReasons.length > 0 && (
                            <div>top exits: {d.botPerformance.topExitReasons.map((r) => `${r.reason}(${r.count})`).join(', ')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
