import { useState } from 'react';
import { useBotStore } from '../store/botStore';
import { useActivePublicKey } from '../store/walletStore';
import { usePrice } from '../hooks/usePrice';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PnlChart } from '../components/charts/PnlChart';
import { formatPct, timeAgo } from '../utils/format';
import { EXPLORER_BASE } from '../config/constants';
import { closeAllAndStop } from '../hooks/useTradingBot';
import type { TrendingInterval } from '../hooks/useTrendingTokens';
import type { ClosedPosition } from '../store/botStore';

const INTERVALS: { label: string; value: TrendingInterval }[] = [
  { label: '5m', value: '5m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
];

const POLL_OPTIONS = [
  { label: '30s', value: 30_000 },
  { label: '1m', value: 60_000 },
  { label: '2m', value: 120_000 },
  { label: '5m', value: 300_000 },
];

const LOG_COLORS: Record<string, string> = {
  buy: 'text-green',
  sell: 'text-blue',
  skip: 'text-text-dim',
  error: 'text-red',
  info: 'text-text-dim',
};

function Num({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-green/50 tabular-nums"
        />
        {suffix && <span className="text-xs text-text-dim shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-green w-3.5 h-3.5"
      />
      <span className="text-sm text-text">{label}</span>
    </label>
  );
}

function PnlRow({ closed, onClear }: { closed: ClosedPosition[]; onClear: () => void }) {
  const total = closed.length;
  const wins = closed.filter((p) => p.pnlSol > 0).length;
  const winRate = total > 0 ? (wins / total) * 100 : null;
  const totalPnlSol = closed.reduce((s, p) => s + p.pnlSol, 0);
  const best = total > 0 ? Math.max(...closed.map((p) => p.pnlPct)) : null;
  const worst = total > 0 ? Math.min(...closed.map((p) => p.pnlPct)) : null;

  function fmtSol(v: number) {
    const s = (v >= 0 ? '+' : '') + v.toFixed(4);
    return s + ' SOL';
  }

  return (
    <Card>
      <CardHeader
        title="PnL History"
        subtitle={total > 0 ? `${total} closed trade${total !== 1 ? 's' : ''}` : 'No closed trades yet'}
        action={total > 0 ? <Button variant="secondary" size="sm" onClick={onClear}>Clear</Button> : undefined}
      />
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total trades', value: total > 0 ? String(total) : '—', color: 'text-text' },
            { label: 'Win rate', value: winRate != null ? winRate.toFixed(0) + '%' : '—', color: winRate != null ? (winRate >= 50 ? 'text-green' : 'text-red') : 'text-text-dim' },
            { label: 'Total PnL', value: total > 0 ? fmtSol(totalPnlSol) : '—', color: total > 0 ? (totalPnlSol >= 0 ? 'text-green' : 'text-red') : 'text-text-dim' },
            { label: 'Best trade', value: best != null ? formatPct(best) : '—', color: best != null ? 'text-green' : 'text-text-dim' },
            { label: 'Worst trade', value: worst != null ? formatPct(worst) : '—', color: worst != null && worst < 0 ? 'text-red' : 'text-text-dim' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-surface-2 border border-border rounded-lg px-4 py-3 flex flex-col gap-1">
              <span className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">{label}</span>
              <span className={`text-base font-bold tabular-nums ${color}`}>{value}</span>
            </div>
          ))}
        </div>

        <PnlChart closed={closed} height={180} />
      </CardBody>
    </Card>
  );
}

export function BotPage() {
  const pubkey = useActivePublicKey();
  const { config, positions, closedPositions, log, updateConfig, removePosition, clearLog, clearHistory } = useBotStore();
  const [stopping, setStopping] = useState(false);

  const openPositions = positions.filter((p) => p.status === 'open' || p.status === 'closing');
  const positionMints = openPositions.map((p) => p.mint);
  const { data: prices } = usePrice(positionMints.length > 0 ? positionMints : ['']);

  async function toggle() {
    if (!pubkey) return;
    if (config.enabled) {
      setStopping(true);
      await closeAllAndStop();
      setStopping(false);
    } else {
      updateConfig({ enabled: true });
    }
  }

  const isRunning = config.enabled && !!pubkey;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text">Auto Trader</h1>
          <p className="text-xs text-text-dim">Buys trending tokens automatically. Sells via trailing stop.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${stopping ? 'text-orange' : isRunning ? 'text-green' : 'text-text-dim'}`}>
            <span className={`w-2 h-2 rounded-full ${stopping ? 'bg-orange animate-pulse' : isRunning ? 'bg-green animate-pulse' : 'bg-text-dim/40'}`} />
            {stopping ? 'Stopping' : isRunning ? 'Running' : 'Stopped'}
          </div>
          <Button
            variant={isRunning ? 'secondary' : 'primary'}
            size="sm"
            onClick={toggle}
            disabled={!pubkey || stopping}
          >
            {stopping ? 'Closing…' : isRunning ? 'Stop Bot' : 'Start Bot'}
          </Button>
        </div>
      </div>

      {!pubkey && (
        <Card>
          <CardBody>
            <p className="text-sm text-text-dim text-center py-2">Connect a wallet to use the auto trader.</p>
          </CardBody>
        </Card>
      )}

      <PnlRow closed={closedPositions} onClear={clearHistory} />

      <div className="grid grid-cols-3 gap-4 items-start">
        {/* Col 1: Entry + Exit stacked */}
        <div className="flex flex-col gap-4">
          {/* Entry Config */}
          <Card>
            <CardHeader title="Entry" subtitle="When to buy" />
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Signal interval</label>
                  <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
                    {INTERVALS.map(({ label, value }) => (
                      <button key={value} onClick={() => updateConfig({ interval: value })}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${config.interval === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Poll every</label>
                  <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
                    {POLL_OPTIONS.map(({ label, value }) => (
                      <button key={value} onClick={() => updateConfig({ pollIntervalMs: value })}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${config.pollIntervalMs === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Num label="Buy amount" value={config.buyAmountSol} onChange={(v) => updateConfig({ buyAmountSol: v })} min={0.001} step={0.01} suffix="SOL" />
                <Num label="Max positions" value={config.maxPositions} onChange={(v) => updateConfig({ maxPositions: v })} min={1} max={20} />
                <Num label="Min score" value={config.minOrganicScore} onChange={(v) => updateConfig({ minOrganicScore: v })} min={0} max={100} />
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Price chg range</label>
                  <div className="flex items-center gap-1.5">
                    <input type="number" value={config.minPriceChangePct} min={0} step={0.5}
                      onChange={(e) => updateConfig({ minPriceChangePct: Number(e.target.value) })}
                      className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-green/50 tabular-nums" />
                    <span className="text-xs text-text-dim shrink-0">—</span>
                    <input type="number" value={config.maxPriceChangePct} min={0} step={0.5}
                      onChange={(e) => updateConfig({ maxPriceChangePct: Number(e.target.value) })}
                      className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-green/50 tabular-nums" />
                    <span className="text-xs text-text-dim shrink-0">% (0=∞)</span>
                  </div>
                </div>
                <Num label="Min org buyers" value={config.minOrganicBuyers} onChange={(v) => updateConfig({ minOrganicBuyers: v })} min={0} />
                <Num label="Max price impact" value={config.maxPriceImpactPct} onChange={(v) => updateConfig({ maxPriceImpactPct: v })} min={0} step={0.5} suffix="%" />
                <Num label="Mcap min" value={config.mcapMin} onChange={(v) => updateConfig({ mcapMin: v })} min={0} step={100_000} suffix="$" />
                <Num label="Mcap max" value={config.mcapMax} onChange={(v) => updateConfig({ mcapMax: v })} min={0} step={1_000_000} suffix="$ (0=∞)" />
                <Num label="Slippage" value={config.slippageBps} onChange={(v) => updateConfig({ slippageBps: v })} min={1} step={10} suffix="bps" />
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 border-t border-border">
                <p className="text-[10px] text-text-dim uppercase tracking-wide font-semibold self-center">Skip</p>
                <Check label="Suspicious" checked={config.skipSus} onChange={(v) => updateConfig({ skipSus: v })} />
                <Check label="Mintable supply" checked={config.skipMintable} onChange={(v) => updateConfig({ skipMintable: v })} />
                <Check label="Freezable" checked={config.skipFreezable} onChange={(v) => updateConfig({ skipFreezable: v })} />
              </div>
            </CardBody>
          </Card>

          {/* Exit Config */}
          <Card>
            <CardHeader title="Exit" subtitle="When to sell" />
            <CardBody className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <Num label="Trailing stop" value={config.trailingStopPct} onChange={(v) => updateConfig({ trailingStopPct: v })} min={1} max={99} step={1} suffix="%" />
                <Num label="Take profit" value={config.takeProfitPct} onChange={(v) => updateConfig({ takeProfitPct: v })} min={1} step={5} suffix="%" />
                <Num label="Max hold time" value={config.maxHoldMinutes} onChange={(v) => updateConfig({ maxHoldMinutes: v })} min={1} step={5} suffix="min" />
              </div>
              <div className="rounded-lg bg-surface-2 border border-border p-3 text-xs text-text-dim space-y-1.5">
                <p>• Trailing stop sells when price drops <span className="text-text font-medium">{config.trailingStopPct}%</span> from its peak.</p>
                <p>• Take profit triggers at <span className="text-green font-medium">+{config.takeProfitPct}%</span> above entry.</p>
                <p>• Force-sells after <span className="text-text font-medium">{config.maxHoldMinutes}m</span> regardless of price.</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Col 2: Active Positions */}
        <Card>
          <CardHeader title="Active Positions" subtitle={`${openPositions.length} open`} />
          <CardBody className="p-0">
            {openPositions.length === 0 ? (
              <p className="text-sm text-text-dim text-center py-6">No open positions</p>
            ) : (
              <div className="divide-y divide-border">
                <div className="grid grid-cols-[1fr_80px_80px_70px_80px_60px] gap-x-2 px-4 py-2 text-[10px] font-semibold text-text-dim uppercase tracking-wide">
                  <span>Token</span>
                  <span className="text-right">Entry</span>
                  <span className="text-right">Current</span>
                  <span className="text-right">P&L</span>
                  <span className="text-right">Stop</span>
                  <span className="text-right">Held</span>
                </div>
                {openPositions.map((pos) => {
                  const currentPrice = prices?.[pos.mint]?.usdPrice;
                  const pnlPct = currentPrice
                    ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
                    : null;
                  const heldMin = Math.floor((Date.now() - pos.entryTime) / 60_000);

                  function fmtPrice(p: number) {
                    if (p >= 1) return '$' + p.toFixed(4);
                    const d = Math.max(2, -Math.floor(Math.log10(p)) + 2);
                    return '$' + p.toFixed(Math.min(d, 10));
                  }

                  return (
                    <div key={pos.id} className="grid grid-cols-[1fr_80px_80px_70px_80px_60px] gap-x-2 px-4 py-3 items-center">
                      <div>
                        <p className="text-sm font-semibold text-text">{pos.symbol}</p>
                        <p className="text-[10px] text-text-dim font-mono">{pos.amountSolIn} SOL</p>
                      </div>
                      <span className="text-xs text-text-dim text-right font-mono tabular-nums">{fmtPrice(pos.entryPrice)}</span>
                      <span className="text-xs text-right font-mono tabular-nums text-text">{currentPrice ? fmtPrice(currentPrice) : '—'}</span>
                      <span className={`text-xs text-right font-mono tabular-nums font-semibold ${pnlPct == null ? 'text-text-dim' : pnlPct >= 0 ? 'text-green' : 'text-red'}`}>
                        {pnlPct != null ? formatPct(pnlPct) : '—'}
                      </span>
                      <span className="text-xs text-text-dim text-right font-mono tabular-nums">{fmtPrice(pos.trailingStopPrice)}</span>
                      <div className="text-right">
                        <p className="text-xs text-text-dim tabular-nums">{heldMin}m</p>
                        {pos.status === 'closing' && <p className="text-[10px] text-orange animate-pulse">closing…</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Col 3: Activity Log */}
        <Card>
          <CardHeader
            title="Activity Log"
            subtitle={`${log.length} entries`}
            action={log.length > 0 ? <Button variant="secondary" size="sm" onClick={clearLog}>Clear</Button> : undefined}
          />
          <CardBody className="p-0">
            {log.length === 0 ? (
              <p className="text-sm text-text-dim text-center py-6">No activity yet</p>
            ) : (
              <div className="overflow-y-auto divide-y divide-border/40" style={{ maxHeight: '70vh' }}>
                {log.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="text-[10px] text-text-dim tabular-nums shrink-0 pt-0.5 w-16">{timeAgo(entry.time)}</span>
                    <span className={`text-[10px] font-semibold uppercase shrink-0 pt-0.5 w-8 ${LOG_COLORS[entry.type]}`}>{entry.type}</span>
                    <span className="text-xs text-text flex-1 min-w-0">{entry.message}</span>
                    {entry.txSig && (
                      <a href={`${EXPLORER_BASE}/tx/${entry.txSig}`} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-text-dim hover:text-green transition-colors shrink-0">↗</a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
