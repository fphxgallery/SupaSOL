import { useState } from 'react';
import { useBotStore } from '../store/botStore';
import { useActivePublicKey } from '../store/walletStore';
import { usePrice } from '../hooks/usePrice';
import { useVaultStatus } from '../hooks/useVaultStatus';
import { useBackgroundBot, useInvalidateBotStatus } from '../hooks/useBackgroundBot';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PnlChart } from '../components/charts/PnlChart';
import { UnlockBotModal } from '../components/bot/UnlockBotModal';
import { AiDecisionsPanel } from '../components/bot/AiDecisionsPanel';
import { formatPct, timeAgo } from '../utils/format';
import { EXPLORER_BASE } from '../config/constants';
import { closeAllAndStop } from '../hooks/useTradingBot';
import { stopBot, closeAllBot, updateBotConfig, clearBotHistory, clearBotLog, removeBotPosition, pruneBotPositions } from '../api/bot';
import { useUiStore } from '../store/uiStore';
import type { TrendingInterval } from '../hooks/useTrendingTokens';
import type { ClosedPosition, BotConfig, AiMode, AiModel, AfterT1Mode } from '../store/botStore';
import type { VaultData } from '../api/vault';

const INTERVALS: { label: string; value: TrendingInterval }[] = [
  { label: '5m', value: '5m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
];

const AI_MODES: { label: string; value: AiMode; desc: string }[] = [
  { label: 'Veto', value: 'veto', desc: 'AI can block buys' },
  { label: 'Confirm', value: 'confirm', desc: 'AI must approve buys' },
  { label: 'Advisory', value: 'advisory', desc: 'Log only, no block' },
];

const AI_MODELS: { label: string; value: AiModel; desc: string }[] = [
  { label: 'Mini', value: 'gpt-4o-mini', desc: 'Cheap, fast' },
  { label: 'Full', value: 'gpt-4o', desc: 'Smarter, costly' },
];

const AFTER_T1_MODES: { label: string; value: AfterT1Mode; desc: string }[] = [
  { label: 'Breakeven', value: 'breakeven', desc: 'Lock stop at entry + 0.5% after T1' },
  { label: 'Tighten', value: 'tighten', desc: 'Use tight trail % after T1' },
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
  label, value, onChange, min, max, step = 1, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">{label}</label>
      <div className="relative flex items-center">
        <input
          type="number" value={value} min={min} max={max} step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-surface-2 border border-border rounded-md pl-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-green/50 tabular-nums"
          style={{ paddingRight: suffix ? `${suffix.length * 0.6 + 1.25}rem` : '0.625rem' }}
        />
        {suffix && <span className="absolute right-2.5 text-xs text-text-dim pointer-events-none">{suffix}</span>}
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-green w-3.5 h-3.5" />
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

  function fmtSol(v: number) { return (v >= 0 ? '+' : '') + v.toFixed(4) + ' SOL'; }

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
  const { config, positions, closedPositions, log, updateConfig, clearLog, clearHistory, removePosition } = useBotStore();
  const addToast = useUiStore((s) => s.addToast);
  const [stopping, setStopping] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);

  const { data: vaultStatus } = useVaultStatus();
  const { data: bgBot } = useBackgroundBot();
  const invalidateBotStatus = useInvalidateBotStatus();

  const vaultData = vaultStatus?.exists ? vaultStatus as VaultData : null;
  const bgRunning = bgBot?.running ?? false;

  // When background bot is running, show its state; otherwise use local Zustand state
  const activePositions = bgRunning ? (bgBot?.positions ?? []) : positions;
  const activeClosedPositions = bgRunning ? (bgBot?.closedPositions ?? []) : closedPositions;
  const activeLog = bgRunning ? (bgBot?.log ?? []) : log;
  const activeConfig = bgRunning ? (bgBot?.config ?? config) : config;

  const openPositions = activePositions.filter((p) => p.status === 'open' || p.status === 'closing');
  const positionMints = openPositions.map((p) => p.mint);
  const { data: prices } = usePrice(positionMints.length > 0 ? positionMints : ['']);

  function handleConfigChange(updates: Partial<BotConfig>) {
    updateConfig(updates);
    if (bgRunning) updateBotConfig(updates).catch(() => {});
  }

  async function handleRemovePosition(id: string, symbol: string) {
    if (!confirm(`Remove ${symbol} from Active Positions? This does not sell — it only clears the entry from bot state.`)) return;
    try {
      if (bgRunning) {
        await removeBotPosition(id);
        invalidateBotStatus();
      } else {
        removePosition(id);
      }
      addToast({ type: 'success', message: `Removed ${symbol} from state` });
    } catch (err) {
      addToast({ type: 'error', message: `Remove failed: ${err instanceof Error ? err.message : 'unknown'}` });
    }
  }

  const [pruning, setPruning] = useState(false);
  async function handlePruneGhosts() {
    if (!bgRunning) {
      addToast({ type: 'error', message: 'Prune only available when background bot is unlocked' });
      return;
    }
    if (!confirm('Scan wallet and remove any position whose on-chain balance is 0? Does not sell.')) return;
    setPruning(true);
    try {
      const result = await pruneBotPositions();
      invalidateBotStatus();
      if (result.removed.length === 0) {
        addToast({ type: 'info', message: `No ghosts found (${result.scanned} scanned)` });
      } else {
        addToast({ type: 'success', message: `Pruned ${result.removed.length}: ${result.removed.map((r) => r.symbol).join(', ')}` });
      }
    } catch (err) {
      addToast({ type: 'error', message: `Prune failed: ${err instanceof Error ? err.message : 'unknown'}` });
    } finally {
      setPruning(false);
    }
  }

  async function toggle() {
    if (bgRunning) {
      setStopping(true);
      try {
        await closeAllBot();
        invalidateBotStatus();
        addToast({ type: 'success', message: 'Background bot stopped' });
      } catch { addToast({ type: 'error', message: 'Failed to stop background bot' }); }
      finally { setStopping(false); }
    } else if (!pubkey) {
      return;
    } else if (config.enabled) {
      setStopping(true);
      await closeAllAndStop();
      setStopping(false);
    } else {
      updateConfig({ enabled: true });
    }
  }

  async function handleStopBgOnly() {
    setStopping(true);
    try {
      await stopBot();
      invalidateBotStatus();
      addToast({ type: 'success', message: 'Background bot stopped (positions kept open)' });
    } catch { addToast({ type: 'error', message: 'Failed to stop background bot' }); }
    finally { setStopping(false); }
  }

  async function handleClearHistory() {
    if (bgRunning) {
      await clearBotHistory().catch(() => {});
      invalidateBotStatus();
    } else {
      clearHistory();
    }
  }

  async function handleClearLog() {
    if (bgRunning) {
      await clearBotLog().catch(() => {});
      invalidateBotStatus();
    } else {
      clearLog();
    }
  }

  const isLocalRunning = config.enabled && !!pubkey && !bgRunning;
  const isRunning = bgRunning || isLocalRunning;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text">Auto Trader</h1>
          <p className="text-xs text-text-dim">Buys trending tokens automatically. Sells via trailing stop.</p>
        </div>
        <div className="flex items-center gap-3">
          {bgRunning && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-400">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              Background
            </div>
          )}
          {!bgRunning && (
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${stopping ? 'text-orange' : isLocalRunning ? 'text-green' : 'text-text-dim'}`}>
              <span className={`w-2 h-2 rounded-full ${stopping ? 'bg-orange animate-pulse' : isLocalRunning ? 'bg-green animate-pulse' : 'bg-text-dim/40'}`} />
              {stopping ? 'Stopping' : isLocalRunning ? 'Running' : 'Stopped'}
            </div>
          )}
          {bgRunning ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleStopBgOnly} disabled={stopping}>
                Stop (keep positions)
              </Button>
              <Button variant="secondary" size="sm" onClick={toggle} disabled={stopping}>
                {stopping ? 'Closing…' : 'Close All & Stop'}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {vaultData && !isLocalRunning && (
                <Button variant="secondary" size="sm" onClick={() => setUnlockOpen(true)}>
                  Run in Background
                </Button>
              )}
              <Button
                variant={isLocalRunning ? 'secondary' : 'primary'}
                size="sm"
                onClick={toggle}
                disabled={!pubkey || stopping}
              >
                {stopping ? 'Closing…' : isLocalRunning ? 'Stop Bot' : 'Start Bot'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {!pubkey && !bgRunning && (
        <Card>
          <CardBody>
            <p className="text-sm text-text-dim text-center py-2">Connect a wallet to use the auto trader.</p>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_640px] gap-4 items-start">
        {/* Right col: Entry + Exit + AI Advisor stacked */}
        <div className="flex flex-col gap-4 order-2">
          <Card>
            <CardHeader title="Entry" subtitle="When to buy" />
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Signal interval</label>
                  <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
                    {INTERVALS.map(({ label, value }) => (
                      <button key={value} onClick={() => handleConfigChange({ interval: value })}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${activeConfig.interval === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Poll every</label>
                  <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
                    {POLL_OPTIONS.map(({ label, value }) => (
                      <button key={value} onClick={() => handleConfigChange({ pollIntervalMs: value })}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${activeConfig.pollIntervalMs === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Num label="Buy amount" value={activeConfig.buyAmountSol} onChange={(v) => handleConfigChange({ buyAmountSol: v })} min={0.001} step={0.01} suffix="SOL" />
                <Num label="Max positions" value={activeConfig.maxPositions} onChange={(v) => handleConfigChange({ maxPositions: v })} min={1} max={20} />
                <Num label="Min score" value={activeConfig.minOrganicScore} onChange={(v) => handleConfigChange({ minOrganicScore: v })} min={0} max={100} />
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Price chg range</label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex items-center flex-1">
                      <input type="number" value={activeConfig.minPriceChangePct} min={0} step={0.5}
                        onChange={(e) => handleConfigChange({ minPriceChangePct: Number(e.target.value) })}
                        className="w-full bg-surface-2 border border-border rounded-md pl-2.5 pr-6 py-1.5 text-sm text-text focus:outline-none focus:border-green/50 tabular-nums" />
                      <span className="absolute right-2.5 text-xs text-text-dim pointer-events-none">%</span>
                    </div>
                    <span className="text-xs text-text-dim shrink-0">—</span>
                    <div className="relative flex items-center flex-1">
                      <input type="number" value={activeConfig.maxPriceChangePct} min={0} step={0.5}
                        onChange={(e) => handleConfigChange({ maxPriceChangePct: Number(e.target.value) })}
                        className="w-full bg-surface-2 border border-border rounded-md pl-2.5 py-1.5 text-sm text-text focus:outline-none focus:border-green/50 tabular-nums" style={{ paddingRight: '4.5rem' }} />
                      <span className="absolute right-2.5 text-xs text-text-dim pointer-events-none">% (0=∞)</span>
                    </div>
                  </div>
                </div>
                <Num label="Min org buyers" value={activeConfig.minOrganicBuyers} onChange={(v) => handleConfigChange({ minOrganicBuyers: v })} min={0} />
                <Num label="Min token age" value={activeConfig.minTokenAgeHours} onChange={(v) => handleConfigChange({ minTokenAgeHours: v })} min={0} step={1} suffix="hr (0=off)" />
                <Num label="Max price impact" value={activeConfig.maxPriceImpactPct} onChange={(v) => handleConfigChange({ maxPriceImpactPct: v })} min={0} step={0.5} suffix="%" />
                <Num label="Mcap min" value={activeConfig.mcapMin} onChange={(v) => handleConfigChange({ mcapMin: v })} min={0} step={100_000} suffix="$" />
                <Num label="Mcap max" value={activeConfig.mcapMax} onChange={(v) => handleConfigChange({ mcapMax: v })} min={0} step={1_000_000} suffix="$ (0=∞)" />
                <Num label="Slippage" value={activeConfig.slippageBps} onChange={(v) => handleConfigChange({ slippageBps: v })} min={1} step={10} suffix="bps" />
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 border-t border-border">
                <p className="text-[10px] text-text-dim uppercase tracking-wide font-semibold self-center">Skip</p>
                <Check label="Suspicious" checked={activeConfig.skipSus} onChange={(v) => handleConfigChange({ skipSus: v })} />
                <Check label="Mintable supply" checked={activeConfig.skipMintable} onChange={(v) => handleConfigChange({ skipMintable: v })} />
                <Check label="Freezable" checked={activeConfig.skipFreezable} onChange={(v) => handleConfigChange({ skipFreezable: v })} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Exit" subtitle="When to sell" />
            <CardBody className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <Num label="Trailing stop" value={activeConfig.trailingStopPct} onChange={(v) => handleConfigChange({ trailingStopPct: v })} min={1} max={99} step={1} suffix="%" />
                <Num label="Max hold time" value={activeConfig.maxHoldMinutes} onChange={(v) => handleConfigChange({ maxHoldMinutes: v })} min={1} step={5} suffix="min" />
                <Num label="Rebuy cooldown" value={activeConfig.rebuyCooldownMinutes} onChange={(v) => handleConfigChange({ rebuyCooldownMinutes: v })} min={0} step={5} suffix="min" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Num label="T1 trigger" value={activeConfig.tp1Pct} onChange={(v) => handleConfigChange({ tp1Pct: v })} min={1} step={1} suffix="%" />
                <Num label="T1 sell" value={activeConfig.tp1SellPct} onChange={(v) => handleConfigChange({ tp1SellPct: v })} min={1} max={99} step={5} suffix="% of initial" />
                <Num label="T2 trigger" value={activeConfig.tp2Pct} onChange={(v) => handleConfigChange({ tp2Pct: v })} min={1} step={1} suffix="%" />
                <Num label="T2 sell" value={activeConfig.tp2SellPct} onChange={(v) => handleConfigChange({ tp2SellPct: v })} min={1} max={100} step={5} suffix="% of remainder" />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3 items-end">
                <Check
                  label="Max hold AI-gated"
                  checked={activeConfig.maxHoldAiGated}
                  onChange={(v) => handleConfigChange({ maxHoldAiGated: v })}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">After T1</label>
                  <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
                    {AFTER_T1_MODES.map(({ label, value, desc }) => (
                      <button key={value} onClick={() => handleConfigChange({ afterT1Mode: value })} title={desc}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${activeConfig.afterT1Mode === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {activeConfig.afterT1Mode === 'tighten' && (
                  <Num label="Tight trail" value={activeConfig.tightTrailPct} onChange={(v) => handleConfigChange({ tightTrailPct: v })} min={1} max={99} step={1} suffix="%" />
                )}
              </div>
              <div className="rounded-lg bg-surface-2 border border-border p-3 text-xs text-text-dim space-y-1.5">
                <p>• Trailing stop sells when price drops <span className="text-text font-medium">{activeConfig.trailingStopPct}%</span> from its peak.</p>
                <p>• T1: at <span className="text-green font-medium">+{activeConfig.tp1Pct}%</span> sell <span className="text-text font-medium">{activeConfig.tp1SellPct}%</span> of initial.</p>
                <p>• After T1: {activeConfig.afterT1Mode === 'breakeven'
                  ? <>lock stop at <span className="text-text font-medium">entry + 0.5%</span> (breakeven floor).</>
                  : <>tighten trail to <span className="text-text font-medium">{activeConfig.tightTrailPct}%</span> from peak.</>}</p>
                <p>• T2: at <span className="text-green font-medium">+{activeConfig.tp2Pct}%</span> sell <span className="text-text font-medium">{activeConfig.tp2SellPct}%</span> of remainder. Tail continues via trailing stop / max hold.</p>
                {activeConfig.aiEnabled && activeConfig.maxHoldAiGated ? (
                  <p>• After <span className="text-text font-medium">{activeConfig.maxHoldMinutes}m</span>, AI Advisor decides: sells on bearish signals, holds if bullish. Force-sells if AI unavailable.</p>
                ) : (
                  <p>• Force-sells after <span className="text-text font-medium">{activeConfig.maxHoldMinutes}m</span> regardless of price.</p>
                )}
                <p>• Exit AI gated until after T2.</p>
                <p>• Won't rebuy same token for <span className="text-text font-medium">{activeConfig.rebuyCooldownMinutes}m</span> after selling. (0 = no cooldown)</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="AI Advisor"
              subtitle="OpenAI-gated entry decisions"
              action={
                <Check
                  label="Enabled"
                  checked={activeConfig.aiEnabled}
                  onChange={(v) => handleConfigChange({ aiEnabled: v })}
                />
              }
            />
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Mode</label>
                  <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
                    {AI_MODES.map(({ label, value, desc }) => (
                      <button key={value} onClick={() => handleConfigChange({ aiMode: value })} title={desc}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${activeConfig.aiMode === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Model</label>
                  <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
                    {AI_MODELS.map(({ label, value, desc }) => (
                      <button key={value} onClick={() => handleConfigChange({ aiModel: value })} title={desc}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${activeConfig.aiModel === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Num label="Min confidence" value={activeConfig.aiMinConfidence} onChange={(v) => handleConfigChange({ aiMinConfidence: v })} min={0} max={100} suffix="%" />
                <Num label="Max calls/hr" value={activeConfig.aiMaxCallsPerHour} onChange={(v) => handleConfigChange({ aiMaxCallsPerHour: v })} min={0} step={10} />
                <Num label="Cache TTL" value={activeConfig.aiCacheMinutes} onChange={(v) => handleConfigChange({ aiCacheMinutes: v })} min={0} step={1} suffix="min" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Num label="Exit AI loss gate" value={activeConfig.aiExitLossPct} onChange={(v) => handleConfigChange({ aiExitLossPct: v })} min={0} max={100} step={1} suffix="%" />
                <Num label="Exit AI gain gate" value={activeConfig.aiExitGainPct} onChange={(v) => handleConfigChange({ aiExitGainPct: v })} min={0} step={1} suffix="%" />
              </div>
              <div className="rounded-lg bg-surface-2 border border-border p-3 text-xs text-text-dim space-y-1.5">
                <p>• Requires <code className="text-text font-mono">OPENAI_API_KEY</code> env var on backend.</p>
                <p>• <span className="text-text font-medium">Veto</span>: AI blocks buys it disapproves; silent approval passes.</p>
                <p>• <span className="text-text font-medium">Confirm</span>: AI must explicitly approve buys, else skip.</p>
                <p>• <span className="text-text font-medium">Advisory</span>: AI logs opinion only, never blocks.</p>
                <p>• Cache reuses decision per token for <span className="text-text font-medium">{activeConfig.aiCacheMinutes}m</span>. Rate cap: <span className="text-text font-medium">{activeConfig.aiMaxCallsPerHour}/hr</span>.</p>
                <p>• Exit AI only consulted when P&amp;L ≤ <span className="text-text font-medium">-{activeConfig.aiExitLossPct}%</span> or ≥ <span className="text-text font-medium">+{activeConfig.aiExitGainPct}%</span>. Middle band → trailing stop / max hold only.</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Left col: PnL on top, then Active Positions + Activity Log side-by-side */}
        <div className="flex flex-col gap-4 order-1">
          <PnlRow closed={activeClosedPositions} onClear={handleClearHistory} />
          <div className="grid grid-cols-2 gap-4 items-start">
            <Card>
          <CardHeader
            title="Active Positions"
            subtitle={`${openPositions.length} open`}
            action={bgRunning && openPositions.length > 0 ? (
              <Button variant="secondary" size="sm" onClick={handlePruneGhosts} disabled={pruning}>
                {pruning ? 'Pruning…' : 'Prune Ghosts'}
              </Button>
            ) : undefined}
          />
          <CardBody className="p-0">
            {openPositions.length === 0 ? (
              <p className="text-sm text-text-dim text-center py-6">No open positions</p>
            ) : (
              <div className="divide-y divide-border">
                <div className="grid grid-cols-[1fr_80px_80px_70px_80px_60px_28px] gap-x-2 px-4 py-2 text-[10px] font-semibold text-text-dim uppercase tracking-wide">
                  <span>Token</span>
                  <span className="text-right">Entry</span>
                  <span className="text-right">Current</span>
                  <span className="text-right">P&L</span>
                  <span className="text-right">Stop</span>
                  <span className="text-right">Held</span>
                  <span />
                </div>
                {openPositions.map((pos) => {
                  const currentPrice = prices?.[pos.mint]?.usdPrice;
                  const pnlPct = currentPrice ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 : null;
                  const heldMin = Math.floor((Date.now() - pos.entryTime) / 60_000);

                  function fmtPrice(p: number) {
                    if (p >= 1) return '$' + p.toFixed(4);
                    const d = Math.max(2, -Math.floor(Math.log10(p)) + 2);
                    return '$' + p.toFixed(Math.min(d, 10));
                  }

                  return (
                    <div key={pos.id} className="grid grid-cols-[1fr_80px_80px_70px_80px_60px_28px] gap-x-2 px-4 py-3 items-center">
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
                      <button
                        onClick={() => handleRemovePosition(pos.id, pos.symbol)}
                        disabled={pos.status === 'closing'}
                        title="Remove from state (no sell)"
                        className="text-text-dim hover:text-red text-sm leading-none disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ×
                      </button>
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
            subtitle={`${activeLog.length} entries`}
            action={activeLog.length > 0 ? <Button variant="secondary" size="sm" onClick={handleClearLog}>Clear</Button> : undefined}
          />
          <CardBody className="p-0">
            {activeLog.length === 0 ? (
              <p className="text-sm text-text-dim text-center py-6">No activity yet</p>
            ) : (
              <div className="overflow-y-auto divide-y divide-border/40" style={{ maxHeight: '420px' }}>
                {activeLog.map((entry) => (
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
      </div>

      <AiDecisionsPanel enabled={bgRunning} />

      {vaultData && (
        <UnlockBotModal
          open={unlockOpen}
          onClose={() => setUnlockOpen(false)}
          vaultData={vaultData}
          config={config}
        />
      )}
    </div>
  );
}
