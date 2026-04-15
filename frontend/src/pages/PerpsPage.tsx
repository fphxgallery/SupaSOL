import { useState, useMemo } from 'react';
import { useActivePublicKey } from '../store/walletStore';
import {
  usePerpsMarkets,
  usePerpsPrices,
  usePerpsPositions,
  usePerpsPreview,
  usePerpsOpen,
  usePerpsClose,
  usePerpsAddCollateral,
  usePerpsRemoveCollateral,
  usePerpsTrigger,
} from '../hooks/usePerps';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { useUiStore } from '../store/uiStore';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { TradingChart } from '../components/charts/TradingChart';
import { formatUsd, formatPct, shortenPubkey } from '../utils/format';
import { SYMBOL_TO_MINT, type PerpsMarket, type PerpsPosition, type PerpSide } from '../api/perps';

// ─── Leverage presets ─────────────────────────────────────────────────────────

const LEVERAGE_PRESETS = [2, 5, 10];
const DEFAULT_SYMBOL = 'SOL';

// ─── Sub-components ───────────────────────────────────────────────────────────

function PnlDisplay({ pnl, pct }: { pnl: number; pct: number }) {
  const positive = pnl >= 0;
  return (
    <span className={positive ? 'text-green' : 'text-red-400'}>
      {positive ? '+' : ''}{formatUsd(pnl)}{' '}
      <span className="text-xs opacity-75">({formatPct(pct)})</span>
    </span>
  );
}

function SideBadge({ side }: { side: PerpSide }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
        side === 'long'
          ? 'bg-green/10 text-green border border-green/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
      }`}
    >
      {side.toUpperCase()}
    </span>
  );
}

// ─── Position card ────────────────────────────────────────────────────────────

function PositionCard({
  position,
  wallet,
  markPrice,
}: {
  position: PerpsPosition;
  wallet: string;
  markPrice?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [removeAmount, setRemoveAmount] = useState('');
  const [slPrice, setSlPrice] = useState(
    position.stopLossPrice ? String(position.stopLossPrice) : '',
  );
  const [tpPrice, setTpPrice] = useState(
    position.takeProfitPrice ? String(position.takeProfitPrice) : '',
  );

  const close = usePerpsClose();
  const addCollateral = usePerpsAddCollateral();
  const removeCollateral = usePerpsRemoveCollateral();
  const setTrigger = usePerpsTrigger();
  const addToast = useUiStore((s) => s.addToast);

  async function handleClose() {
    try {
      await close.mutateAsync({ wallet, positionPubkey: position.positionPubkey, sizeUsd: position.size, symbol: position.symbol });
    } catch { /* surfaced via toast */ }
  }

  async function handleAddCollateral() {
    const ui = parseFloat(addAmount);
    if (isNaN(ui) || ui <= 0) return;
    try {
      await addCollateral.mutateAsync({
        wallet,
        positionPubkey: position.positionPubkey,
        amountUi: ui,
        symbol: position.symbol,
      });
      setAddAmount('');
    } catch { /* surfaced via toast */ }
  }

  async function handleRemoveCollateral() {
    const ui = parseFloat(removeAmount);
    if (isNaN(ui) || ui <= 0) return;
    try {
      await removeCollateral.mutateAsync({
        wallet,
        positionPubkey: position.positionPubkey,
        amountUsdUi: ui,
        symbol: position.symbol,
      });
      setRemoveAmount('');
    } catch { /* surfaced via toast */ }
  }

  async function handleSetSL() {
    const price = parseFloat(slPrice);
    if (isNaN(price) || price <= 0) return;
    // Stop loss must be on the losing side of current price
    if (markPrice) {
      if (position.side === 'long' && price >= markPrice) {
        addToast({ type: 'error', message: 'Stop loss for Long must be below current price' });
        return;
      }
      if (position.side === 'short' && price <= markPrice) {
        addToast({ type: 'error', message: 'Stop loss for Short must be above current price' });
        return;
      }
    }
    try {
      await setTrigger.mutateAsync({
        wallet,
        positionPubkey: position.positionPubkey,
        triggerPriceUi: price,
        isStopLoss: true,
        marketSymbol: position.symbol,
        side: position.side,
        sizeUsdUi: position.size,
        symbol: position.symbol,
      });
    } catch { /* surfaced via toast */ }
  }

  async function handleSetTP() {
    const price = parseFloat(tpPrice);
    if (isNaN(price) || price <= 0) return;
    // Take profit must be on the winning side of current price
    if (markPrice) {
      if (position.side === 'long' && price <= markPrice) {
        addToast({ type: 'error', message: 'Take profit for Long must be above current price' });
        return;
      }
      if (position.side === 'short' && price >= markPrice) {
        addToast({ type: 'error', message: 'Take profit for Short must be below current price' });
        return;
      }
    }
    try {
      await setTrigger.mutateAsync({
        wallet,
        positionPubkey: position.positionPubkey,
        triggerPriceUi: price,
        isStopLoss: false,
        marketSymbol: position.symbol,
        side: position.side,
        sizeUsdUi: position.size,
        symbol: position.symbol,
      });
    } catch { /* surfaced via toast */ }
  }

  const isBusy = close.isPending || addCollateral.isPending || removeCollateral.isPending || setTrigger.isPending;

  return (
    <div className="border border-border rounded-xl bg-surface-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center text-xs font-bold text-green">
            {position.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text">{position.symbol}/USD</span>
              <SideBadge side={position.side} />
              <span className="text-xs text-text-dim">{position.leverage.toFixed(1)}×</span>
            </div>
            <p className="text-xs text-text-dim mt-0.5">{shortenPubkey(position.positionPubkey, 4)}</p>
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-text-dim hover:text-text transition-colors p-1"
        >
          <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-px bg-border mx-4 mb-4 rounded-lg overflow-hidden text-xs">
        {([
          ['Size', formatUsd(position.size)],
          ['Collateral', formatUsd(position.collateral)],
          ['Entry Price', formatUsd(position.entryPrice)],
          ['Mark Price', markPrice != null ? formatUsd(markPrice) : '—'],
          ['Liq. Price', formatUsd(position.liquidationPrice)],
          ['Unrealized PnL', null],
        ] as [string, string | null][]).map(([label, value]) => (
          <div key={label} className="bg-surface px-3 py-2">
            <p className="text-text-dim mb-0.5">{label}</p>
            {label === 'Unrealized PnL' ? (
              <PnlDisplay pnl={position.unrealizedPnl} pct={position.unrealizedPnlPercent} />
            ) : (
              <p className="text-text font-medium">{value}</p>
            )}
          </div>
        ))}
      </div>

      {/* SL/TP chips */}
      {(position.stopLossPrice || position.takeProfitPrice) && (
        <div className="flex gap-2 px-4 mb-3 text-xs">
          {position.stopLossPrice && (
            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
              SL {formatUsd(position.stopLossPrice)}
            </span>
          )}
          {position.takeProfitPrice && (
            <span className="px-2 py-0.5 rounded bg-green/10 text-green border border-green/20">
              TP {formatUsd(position.takeProfitPrice)}
            </span>
          )}
        </div>
      )}

      {/* Expandable section */}
      {expanded && (
        <div className="border-t border-border p-4 flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-2">Adjust Collateral</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex gap-1.5">
                <Input type="number" placeholder="Add (USD)" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} className="text-xs" />
                <Button size="sm" onClick={handleAddCollateral} loading={addCollateral.isPending} disabled={!addAmount || isBusy}>+</Button>
              </div>
              <div className="flex gap-1.5">
                <Input type="number" placeholder="Remove (USD)" value={removeAmount} onChange={(e) => setRemoveAmount(e.target.value)} className="text-xs" />
                <Button size="sm" variant="secondary" onClick={handleRemoveCollateral} loading={removeCollateral.isPending} disabled={!removeAmount || isBusy}>−</Button>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-2">Stop Loss / Take Profit</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex gap-1.5">
                <Input type="number" placeholder="SL price" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} className="text-xs" />
                <Button size="sm" variant="secondary" onClick={handleSetSL} loading={setTrigger.isPending} disabled={!slPrice || isBusy}>Set</Button>
              </div>
              <div className="flex gap-1.5">
                <Input type="number" placeholder="TP price" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} className="text-xs" />
                <Button size="sm" onClick={handleSetTP} loading={setTrigger.isPending} disabled={!tpPrice || isBusy}>Set</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        <Button variant="danger" size="sm" className="w-full" onClick={handleClose} loading={close.isPending} disabled={isBusy}>
          Close Position
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PerpsPage() {
  const pubkey = useActivePublicKey();

  const [selectedMarket, setSelectedMarket] = useState<PerpsMarket | null>(null);
  const [side, setSide] = useState<PerpSide>('long');
  const [collateral, setCollateral] = useState('');
  const [leverage, setLeverage] = useState(2);
  const [showSLTP, setShowSLTP] = useState(false);

  const { data: markets = [], isLoading: marketsLoading } = usePerpsMarkets();
  const { data: prices = {} } = usePerpsPrices();
  const { data: positions = [] } = usePerpsPositions(pubkey, markets);
  const open = usePerpsOpen();

  // Mark price for selected market (live prices → fallback to cached)
  const markPrice = useMemo(() => {
    if (!selectedMarket) return null;
    return prices[selectedMarket.pubkey] ?? prices[selectedMarket.symbol] ?? selectedMarket.currentPrice ?? null;
  }, [selectedMarket, prices]);

  // Chart mint — use selected market's symbol, fall back to SOL.
  const chartSymbol = selectedMarket?.symbol ?? DEFAULT_SYMBOL;
  const chartMint = SYMBOL_TO_MINT[chartSymbol] ?? SYMBOL_TO_MINT[DEFAULT_SYMBOL];

  // Live preview params
  const previewParams = useMemo(() => {
    if (!selectedMarket || !markPrice || !collateral || parseFloat(collateral) <= 0) return null;
    return {
      marketPubkey: selectedMarket.pubkey,
      marketSymbol: selectedMarket.symbol,
      side,
      collateralUi: parseFloat(collateral),
      collateralDecimals: selectedMarket.collateralDecimals,
      leverage,
      markPriceUi: markPrice,
    };
  }, [selectedMarket, side, collateral, leverage, markPrice]);

  const { data: preview, isLoading: previewing } = usePerpsPreview(previewParams);

  async function handleOpen() {
    if (!pubkey || !selectedMarket || !markPrice || !collateral) return;
    const collateralUi = parseFloat(collateral);
    if (isNaN(collateralUi) || collateralUi <= 0) return;
    try {
      await open.mutateAsync({
        wallet: pubkey,
        owner: pubkey,
        marketPubkey: selectedMarket.pubkey,
        marketSymbol: selectedMarket.symbol,
        side,
        collateralUi,
        collateralDecimals: selectedMarket.collateralDecimals,
        leverage,
        markPriceUi: markPrice,
      });
      setCollateral('');
    } catch {
      // onError in usePerpsOpen handles the toast
    }
  }

  const canOpen = !!pubkey && !!selectedMarket && !!collateral && parseFloat(collateral) > 0 && !open.isPending;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-text">Perps</h1>
        <Badge variant="blue">Flash Trade</Badge>
        {selectedMarket && markPrice && (
          <span className="ml-2 text-sm font-semibold text-text-dim">
            {selectedMarket.symbol}/USD{' '}
            <span className="text-text">{formatUsd(markPrice)}</span>
          </span>
        )}
      </div>

      {/* Full-width markets card */}
      <Card>
        <CardBody>
          {marketsLoading ? (
            <div className="h-10 bg-surface rounded-lg animate-pulse" />
          ) : markets.length === 0 ? (
            <p className="text-xs text-text-dim">No markets available</p>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              {markets.map((m) => {
                const mp = prices[m.pubkey] ?? prices[m.symbol] ?? m.currentPrice;
                const isSelected = selectedMarket?.pubkey === m.pubkey;
                return (
                  <button
                    key={m.pubkey}
                    onClick={() => setSelectedMarket(m)}
                    className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors shrink-0 min-w-[72px] ${
                      isSelected
                        ? 'border-green/50 bg-green/5 text-text'
                        : 'border-border bg-surface hover:bg-surface-2 text-text-dim hover:text-text'
                    }`}
                  >
                    <span className="text-xs font-semibold">{m.symbol}</span>
                    {mp > 0 && (
                      <span className="text-xs opacity-60 tabular-nums">
                        {mp >= 1000 ? `$${(mp / 1000).toFixed(1)}k` : `$${mp.toFixed(mp < 1 ? 4 : 2)}`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Full-width trading chart with indicators */}
      <Card>
        <CardBody>
          <TradingChart
            mint={chartMint}
            symbol={chartSymbol}
          />
        </CardBody>
      </Card>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Trade form ─────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader title="Open Position" />
          <CardBody className="flex flex-col gap-4">
            {/* Long / Short */}
            <div>
              <label className="text-xs text-text-dim mb-1.5 block">Direction</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['long', 'short'] as PerpSide[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className={`py-2 rounded-lg text-sm font-semibold capitalize transition-colors border ${
                      side === s
                        ? s === 'long'
                          ? 'bg-green/10 text-green border-green/30'
                          : 'bg-red-500/10 text-red-400 border-red-500/30'
                        : 'bg-surface border-border text-text-dim hover:text-text hover:bg-surface-2'
                    }`}
                  >
                    {s === 'long' ? '↑ Long' : '↓ Short'}
                  </button>
                ))}
              </div>
            </div>

            {/* Collateral */}
            <div>
              <label className="text-xs text-text-dim mb-1.5 block">Collateral (USDC)</label>
              <Input type="number" placeholder="0.00" value={collateral} onChange={(e) => setCollateral(e.target.value)} min="0" />
            </div>

            {/* Leverage */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-text-dim">Leverage</label>
                <span className="text-sm font-bold text-text">{leverage}×</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                {LEVERAGE_PRESETS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLeverage(l)}
                    className={`flex-1 py-1 rounded text-xs font-semibold transition-colors border ${
                      leverage === l
                        ? 'bg-green/10 text-green border-green/30'
                        : 'bg-surface border-border text-text-dim hover:text-text'
                    }`}
                  >
                    {l}×
                  </button>
                ))}
              </div>
              <input
                type="range" min={1} max={10} step={1} value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full accent-green"
              />
              <div className="flex justify-between text-xs text-text-dim mt-0.5">
                <span>1×</span><span>10×</span>
              </div>
            </div>

            {/* Preview — uses API data when available, falls back to local estimate */}
            {previewParams && (() => {
              const collateralUi = parseFloat(collateral);
              const posSize = collateralUi * leverage;
              // Local liquidation estimate: long liq ≈ entry × (1 - 0.9/leverage), short ≈ entry × (1 + 0.9/leverage)
              const mp = markPrice ?? 0;
              const liqFactor = side === 'long' ? 1 - 0.9 / leverage : 1 + 0.9 / leverage;
              const localLiq = mp * liqFactor;

              const displayEntryPrice = preview?.entryPrice || mp;
              const displayLiqPrice = preview?.liquidationPrice || localLiq;
              const displaySize = preview?.size || posSize;
              const displayFee = preview?.fee;

              return (
                <div className="rounded-lg border border-border bg-surface p-3 text-xs flex flex-col gap-2">
                  <p className="text-text-dim font-semibold uppercase tracking-wide text-xs">
                    Preview {!preview && !previewing && <span className="text-xs font-normal opacity-60">(estimate)</span>}
                  </p>
                  {previewing ? (
                    <p className="text-text-dim animate-pulse">Calculating…</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {([
                        ['Entry Price', formatUsd(displayEntryPrice)],
                        ['Liq. Price', formatUsd(displayLiqPrice)],
                        ['Position Size', formatUsd(displaySize)],
                        ['Est. Fee', displayFee && displayFee > 0 ? formatUsd(displayFee) : '—'],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label}>
                          <p className="text-text-dim">{label}</p>
                          <p className="text-text font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* SL/TP note */}
            <button
              onClick={() => setShowSLTP((v) => !v)}
              className="text-xs text-text-dim hover:text-text flex items-center gap-1 transition-colors"
            >
              <span>{showSLTP ? '▾' : '▸'}</span>
              <span>Stop Loss / Take Profit</span>
              <span className="opacity-60">(set after opening)</span>
            </button>
            {showSLTP && (
              <p className="text-xs text-text-dim bg-surface rounded-lg p-3 border border-border">
                After opening a position, expand it in the Positions panel to set Stop Loss and Take Profit prices.
              </p>
            )}

            {/* Open button */}
            <Button onClick={handleOpen} loading={open.isPending} disabled={!canOpen} className="w-full">
              {!pubkey
                ? 'Connect Wallet'
                : !selectedMarket
                ? 'Select a Market'
                : `Open ${side === 'long' ? '↑ Long' : '↓ Short'} ${selectedMarket.symbol}`}
            </Button>
          </CardBody>
        </Card>

        {/* ── Positions ──────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="My Positions"
            subtitle={positions.length > 0 ? `${positions.length} open` : undefined}
          />
          <CardBody className="flex flex-col gap-3">
            {!pubkey ? (
              <p className="text-sm text-text-dim py-8 text-center">Connect a wallet to view positions</p>
            ) : positions.length === 0 ? (
              <p className="text-sm text-text-dim py-8 text-center">No open positions</p>
            ) : (
              positions.map((pos) => (
                <PositionCard
                  key={pos.positionPubkey}
                  position={pos}
                  wallet={pubkey}
                  markPrice={prices[pos.marketPubkey] ?? prices[pos.symbol] ?? undefined}
                />
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
