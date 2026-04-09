import { useState, useMemo, useEffect } from 'react';
import { Connection } from '@solana/web3.js';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TokenLogo } from '../ui/TokenLogo';
import { useSignAndSend } from '../../hooks/useSignAndSend';
import { useUiStore } from '../../store/uiStore';
import { useClusterStore } from '../../store/clusterStore';
import { useSolBalance } from '../../hooks/useSolBalance';
import { useTokenBalances } from '../../hooks/useTokenBalances';
import { MINTS } from '../../config/constants';
import { buildAddLiquidityTxs, type MeteoraPairInfo } from '../../api/dlmm';

interface AddLiquidityModalProps {
  open: boolean;
  onClose: () => void;
  pool: MeteoraPairInfo;
  ownerAddress: string;
  onSuccess?: () => void;
}

type Strategy = 'Spot' | 'Curve' | 'BidAsk';
type Tab = 'Add' | 'Rebalance' | 'Withdraw';

// How many synthetic bars to draw in the distribution chart (visual only)
const CHART_BIN_COUNT = 70;

/** Compute the relative height (0..1) of each bar for a given strategy. */
function strategyBinHeights(nBins: number, currentIdx: number, strategy: Strategy): number[] {
  const arr = new Array(nBins).fill(0);
  if (strategy === 'Spot') {
    // Uniform distribution with a tiny ripple for visual interest
    for (let i = 0; i < nBins; i++) {
      arr[i] = 0.6 + 0.08 * Math.sin(i * 0.6) + 0.08 * Math.cos(i * 0.3);
    }
  } else if (strategy === 'Curve') {
    // Gaussian centered on current price
    const sigma = Math.max(2, nBins / 5);
    for (let i = 0; i < nBins; i++) {
      const dx = i - currentIdx;
      arr[i] = 0.15 + 0.85 * Math.exp(-(dx * dx) / (2 * sigma * sigma));
    }
  } else {
    // Bid/Ask — inverted bell, highest at the edges
    const maxDx = Math.max(currentIdx, nBins - 1 - currentIdx) || 1;
    for (let i = 0; i < nBins; i++) {
      const dx = Math.abs(i - currentIdx);
      arr[i] = 0.2 + 0.8 * (dx / maxDx);
    }
  }
  const max = Math.max(...arr, 0.01);
  return arr.map((v) => v / max);
}

export function AddLiquidityModal({
  open,
  onClose,
  pool,
  ownerAddress,
  onSuccess,
}: AddLiquidityModalProps) {
  const [tab, setTab] = useState<Tab>('Add');
  const [strategy, setStrategy] = useState<Strategy>('Spot');
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoFill, setAutoFill] = useState(true);
  const [flipped, setFlipped] = useState(false);

  const rpcUrl = useClusterStore((s) => s.rpcUrl);
  const { signAndSendAllLegacy, hasWallet } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);

  // Wallet balances for the two pool tokens
  const { data: solLamports } = useSolBalance(ownerAddress);
  const { data: splBalances } = useTokenBalances(ownerAddress);

  const symX = pool.token_x?.symbol ?? pool.name?.split('-')[0] ?? 'X';
  const symY = pool.token_y?.symbol ?? pool.name?.split('-')[1] ?? 'Y';
  const mintX = pool.token_x?.address;
  const mintY = pool.token_y?.address;
  const decimalsX = pool.token_x?.decimals ?? (mintX === MINTS.SOL ? 9 : 6);
  const decimalsY = pool.token_y?.decimals ?? 6;
  const priceX = pool.token_x?.price;
  const priceY = pool.token_y?.price;

  // DLMM position creation reserves ~0.15 SOL for on-chain rent
  const DLMM_RENT_RESERVE_LAMPORTS = 150_000_000;

  const balanceX = useMemo(() => {
    if (!mintX) return null;
    if (mintX === MINTS.SOL) {
      return solLamports != null
        ? Math.max(0, (solLamports as number) - DLMM_RENT_RESERVE_LAMPORTS) / 1e9
        : null;
    }
    return splBalances?.find((b) => b.mint === mintX)?.uiAmount ?? null;
  }, [mintX, solLamports, splBalances]);

  const balanceY = useMemo(() => {
    if (!mintY) return null;
    if (mintY === MINTS.SOL) {
      return solLamports != null
        ? Math.max(0, (solLamports as number) - DLMM_RENT_RESERVE_LAMPORTS) / 1e9
        : null;
    }
    return splBalances?.find((b) => b.mint === mintY)?.uiAmount ?? null;
  }, [mintY, solLamports, splBalances]);

  const hasSolToken = mintX === MINTS.SOL || mintY === MINTS.SOL;

  // Derive current X-per-Y price
  const priceXinY = useMemo(() => {
    if (pool.current_price && pool.current_price > 0) return pool.current_price;
    if (priceX && priceY && priceY > 0) return priceX / priceY;
    return null;
  }, [pool.current_price, priceX, priceY]);

  // Seed the range to ±20% around the current price on first open
  useEffect(() => {
    if (!open) return;
    if ((!minPrice || !maxPrice) && priceXinY && priceXinY > 0) {
      setMinPrice((priceXinY * 0.8).toPrecision(5));
      setMaxPrice((priceXinY * 1.2).toPrecision(5));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, priceXinY]);

  // Computed range metrics
  const minNum = parseFloat(minPrice) || 0;
  const maxNum = parseFloat(maxPrice) || 0;
  const minPct = priceXinY && minNum > 0 ? ((minNum - priceXinY) / priceXinY) * 100 : null;
  const maxPct = priceXinY && maxNum > 0 ? ((maxNum - priceXinY) / priceXinY) * 100 : null;

  // Total bins = log(max/min) / log(1 + binStep/10000), rounded up
  const binStepBps = pool.pool_config?.bin_step;
  const totalBins = useMemo(() => {
    if (!binStepBps || !minNum || !maxNum || minNum >= maxNum) return null;
    const factor = 1 + binStepBps / 10000;
    return Math.max(1, Math.ceil(Math.log(maxNum / minNum) / Math.log(factor)));
  }, [binStepBps, minNum, maxNum]);

  // Where is the current price within the chart (as a bin index 0..CHART_BIN_COUNT-1)?
  const currentBinIdx = useMemo(() => {
    if (!priceXinY || !minNum || !maxNum || minNum >= maxNum) return Math.floor(CHART_BIN_COUNT / 2);
    const clamped = Math.max(minNum, Math.min(maxNum, priceXinY));
    const t = (Math.log(clamped) - Math.log(minNum)) / (Math.log(maxNum) - Math.log(minNum));
    return Math.round(t * (CHART_BIN_COUNT - 1));
  }, [priceXinY, minNum, maxNum]);

  const binHeights = useMemo(
    () => strategyBinHeights(CHART_BIN_COUNT, currentBinIdx, strategy),
    [currentBinIdx, strategy],
  );

  // X-axis tick labels (log-spaced between min and max)
  const axisTicks = useMemo(() => {
    if (!minNum || !maxNum || minNum >= maxNum) return [];
    const n = 5;
    const logMin = Math.log(minNum);
    const logMax = Math.log(maxNum);
    const ticks: number[] = [];
    for (let i = 0; i < n; i++) {
      ticks.push(Math.exp(logMin + ((logMax - logMin) * i) / (n - 1)));
    }
    return ticks;
  }, [minNum, maxNum]);

  function handleChangeX(val: string) {
    setAmountX(val);
    if (autoFill && priceXinY && val && !isNaN(parseFloat(val))) {
      const paired = parseFloat(val) * priceXinY;
      setAmountY(paired.toFixed(6).replace(/\.?0+$/, ''));
    } else if (!val) {
      setAmountY('');
    }
  }

  function handleChangeY(val: string) {
    setAmountY(val);
    if (autoFill && priceXinY && val && !isNaN(parseFloat(val))) {
      const paired = parseFloat(val) / priceXinY;
      setAmountX(paired.toFixed(6).replace(/\.?0+$/, ''));
    } else if (!val) {
      setAmountX('');
    }
  }

  function setHalfX() {
    if (balanceX != null) handleChangeX((balanceX / 2).toFixed(6).replace(/\.?0+$/, ''));
  }

  function setHalfY() {
    if (balanceY != null) handleChangeY((balanceY / 2).toFixed(6).replace(/\.?0+$/, ''));
  }

  async function handleAdd() {
    if (!amountX && !amountY) {
      addToast({ type: 'error', message: 'Enter at least one token amount' });
      return;
    }
    if (!minPrice || !maxPrice) {
      addToast({ type: 'error', message: 'Enter a price range' });
      return;
    }
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    if (isNaN(min) || isNaN(max) || min <= 0) {
      addToast({ type: 'error', message: 'Enter valid prices greater than 0' });
      return;
    }
    if (min >= max) {
      addToast({ type: 'error', message: 'Min price must be less than max price' });
      return;
    }

    const xAmt = parseFloat(amountX || '0');
    const yAmt = parseFloat(amountY || '0');
    if (isNaN(xAmt) || isNaN(yAmt)) {
      addToast({ type: 'error', message: 'Enter valid token amounts' });
      return;
    }

    setLoading(true);
    try {
      const xBase = BigInt(Math.floor(xAmt * 10 ** decimalsX));
      const yBase = BigInt(Math.floor(yAmt * 10 ** decimalsY));

      addToast({ type: 'info', message: 'Building add liquidity transactions...' });
      const connection = new Connection(rpcUrl, 'confirmed');

      const entries = await buildAddLiquidityTxs(connection, pool.address, ownerAddress, {
        totalXAmount: xBase,
        totalYAmount: yBase,
        minPrice: min,
        maxPrice: max,
        strategyType: strategy,
      });

      await signAndSendAllLegacy(
        entries.map((e) => e.tx),
        `Add Liquidity ${pool.name}`,
        entries.map((e) => [e.positionKeypair]),
      );
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: 'error', message: msg || 'Add liquidity failed' });
    } finally {
      setLoading(false);
    }
  }

  // Format the current price string depending on the pair display direction
  const displayPriceLabel = flipped
    ? priceXinY && priceXinY > 0 ? `${(1 / priceXinY).toPrecision(4)} ${symX}/${symY}` : '—'
    : priceXinY ? `${priceXinY.toPrecision(4)} ${symY}/${symX}` : '—';

  // USD value helpers
  const amtXUsd = priceX && amountX ? (parseFloat(amountX) || 0) * priceX : null;
  const amtYUsd = priceY && amountY ? (parseFloat(amountY) || 0) * priceY : null;

  return (
    <Modal open={open} onClose={onClose} title="Add Liquidity" maxWidth="max-w-lg">
      {/* ── Header: pair + bin step + current price ───────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex -space-x-2">
          <TokenLogo mint={mintX} symbol={symX} size="md" />
          <TokenLogo mint={mintY} symbol={symY} size="md" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text truncate">{pool.name}</p>
          <p className="text-[11px] text-text-dim">
            {binStepBps !== undefined && `${binStepBps} bps · `}
            APR {((pool.apr ?? 0) + (pool.farm_apr ?? 0)).toFixed(2)}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider">Current</p>
          <p className="text-sm font-mono text-text">{displayPriceLabel}</p>
        </div>
      </div>

      {/* ── Tab row + refresh + slippage ──────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border mb-4">
        <div className="flex items-center gap-4">
          {(['Add', 'Rebalance', 'Withdraw'] as Tab[]).map((t) => {
            const active = tab === t;
            const disabled = t !== 'Add';
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setTab(t)}
                className={`relative pb-2 text-sm transition-colors cursor-pointer ${
                  active
                    ? 'text-text font-semibold'
                    : disabled
                    ? 'text-text-dim/40 cursor-not-allowed'
                    : 'text-text-dim hover:text-text'
                }`}
              >
                {t}
                {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-orange rounded-full" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 pb-2">
          <button
            type="button"
            title="Refresh"
            className="w-7 h-7 flex items-center justify-center rounded-md bg-surface-2 border border-border text-text-dim hover:text-text cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M4.582 9A7.97 7.97 0 0112 4c4.418 0 8 3.582 8 8s-3.582 8-8 8a7.97 7.97 0 01-6.938-4" />
            </svg>
          </button>
          <button
            type="button"
            title="Slippage"
            className="h-7 px-2 flex items-center gap-1 rounded-md bg-surface-2 border border-border text-text-dim hover:text-text cursor-pointer text-[11px] font-medium"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            </svg>
            1%
          </button>
        </div>
      </div>

      {/* ── Legend + pair flip ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple" />
            <span className="text-xs text-text">{symX}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue" />
            <span className="text-xs text-text">{symY}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFlipped((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-text-dim hover:text-text cursor-pointer"
        >
          <span className="font-mono">
            {flipped ? `${symX}/${symY}` : `${symY}/${symX}`}
          </span>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </button>
      </div>

      {/* ── Bin distribution chart ───────────────────────────────────────── */}
      <div className="bg-surface-2 border border-border rounded-xl p-3 mb-2">
        <div className="relative h-20">
          <div className="absolute inset-0 flex items-end justify-between gap-[1px]">
            {binHeights.map((h, i) => {
              const isLeft = i < currentBinIdx;
              const color = isLeft ? '#3b82f6' : '#8b5cf6'; // blue / purple
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${Math.max(3, h * 100)}%`,
                    background: color,
                    opacity: 0.35 + h * 0.65,
                  }}
                />
              );
            })}
          </div>
          {/* Current price marker */}
          {priceXinY && minNum > 0 && maxNum > minNum && priceXinY >= minNum && priceXinY <= maxNum && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: `${(currentBinIdx / (CHART_BIN_COUNT - 1)) * 100}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-surface border border-border rounded px-1.5 py-0.5 text-[9px] text-text-dim">
                {priceXinY.toPrecision(4)} {symY}/{symX}
              </div>
              <div className="absolute top-3 bottom-0 left-1/2 w-px border-l border-dashed border-text-dim/60" />
            </div>
          )}
        </div>

        {/* Overview strip */}
        <div className="mt-2 h-6 flex items-end justify-between gap-[1px]">
          {binHeights.map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-muted rounded-sm"
              style={{ height: `${Math.max(8, h * 100)}%`, opacity: 0.4 + h * 0.3 }}
            />
          ))}
        </div>

        {/* Axis ticks */}
        {axisTicks.length > 0 && (
          <div className="flex justify-between mt-1.5 text-[10px] text-text-dim font-mono">
            {axisTicks.map((t, i) => (
              <span key={i}>{t.toPrecision(3)}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Min / Max price inputs ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {[
          { label: 'Min Price', value: minPrice, set: setMinPrice, pct: minPct },
          { label: 'Max Price', value: maxPrice, set: setMaxPrice, pct: maxPct },
        ].map(({ label, value, set, pct }) => (
          <div key={label}>
            <p className="text-[11px] text-text-dim mb-1">{label}</p>
            <div className="bg-surface-2 border border-border rounded-lg px-2.5 py-2 flex items-center gap-2 focus-within:border-border-2">
              <input
                type="number"
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder="0.00"
                className="flex-1 min-w-0 bg-transparent text-sm font-mono text-text outline-none"
              />
              {pct !== null && (
                <span className={`text-[11px] font-mono shrink-0 ${pct >= 0 ? 'text-green' : 'text-red'}`}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {totalBins !== null && (
        <p className="text-[11px] text-text-dim mb-4">
          <span className="underline decoration-dotted">Total Bins</span>: <span className="text-text font-mono">{totalBins}</span>
        </p>
      )}

      {/* ── Amount section with Auto-Fill toggle ─────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-text">Amount</p>
        <button
          type="button"
          onClick={() => setAutoFill((v) => !v)}
          className="flex items-center gap-2 text-[11px] text-text-dim cursor-pointer"
        >
          Auto-Fill
          <span className={`relative w-8 h-4 rounded-full transition-colors ${autoFill ? 'bg-green' : 'bg-border-2'}`}>
            <span
              className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                autoFill ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {([
          { sym: symX, mint: mintX, value: amountX, onChange: handleChangeX, balance: balanceX, half: setHalfX, usd: amtXUsd },
          { sym: symY, mint: mintY, value: amountY, onChange: handleChangeY, balance: balanceY, half: setHalfY, usd: amtYUsd },
        ] as const).map(({ sym, mint, value, onChange, balance, half, usd }) => (
          <div key={sym} className="bg-surface-2 border border-border rounded-xl px-3 py-2.5 flex items-center gap-3 focus-within:border-border-2">
            <TokenLogo mint={mint} symbol={sym} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text">{sym}</p>
              <div className="flex items-center gap-1.5 text-[11px] text-text-dim">
                <span className="font-mono">
                  {balance != null ? balance.toLocaleString('en-US', { maximumFractionDigits: 5 }) : '—'}
                </span>
                <span className="text-border-2">|</span>
                <button
                  type="button"
                  onClick={half}
                  disabled={balance == null}
                  className="text-text-dim hover:text-text cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  50%
                </button>
                <svg className="w-2.5 h-2.5 text-text-dim/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
            </div>
            <div className="text-right">
              <input
                type="number"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="0.00"
                className="w-24 bg-transparent text-sm font-mono text-text outline-none text-right"
              />
              <p className="text-[11px] text-text-dim font-mono">
                {usd != null ? `$${usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '$0.00'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Strategy selector ────────────────────────────────────────────── */}
      <p className="text-xs font-semibold text-text mb-2">
        <span className="underline decoration-dotted">Strategy</span>
      </p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {([
          { key: 'Spot' as const, label: 'Spot', icon: <BarsIcon variant="spot" /> },
          { key: 'Curve' as const, label: 'Curve', icon: <BarsIcon variant="curve" /> },
          { key: 'BidAsk' as const, label: 'Bid Ask', icon: <BarsIcon variant="bidask" /> },
        ]).map(({ key, label, icon }) => {
          const active = strategy === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStrategy(key)}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                active
                  ? 'bg-surface-2 border-border-2 text-text'
                  : 'bg-transparent border-border text-text-dim hover:text-text hover:border-border-2'
              }`}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>

      {/* ── SOL rent hint (compact) ──────────────────────────────────────── */}
      {hasSolToken && (
        <p className="text-[10px] text-text-dim mb-3 text-center">
          ⚠ Reserves ~0.15 SOL for on-chain rent (recoverable on close)
        </p>
      )}

      {/* ── Add Liquidity button ─────────────────────────────────────────── */}
      <Button
        className="w-full"
        onClick={handleAdd}
        disabled={loading || !hasWallet}
      >
        {!hasWallet ? 'Connect wallet first' : loading ? 'Adding Liquidity…' : 'Add Liquidity'}
      </Button>
    </Modal>
  );
}

// ─── Strategy icons ─────────────────────────────────────────────────────────

function BarsIcon({ variant }: { variant: 'spot' | 'curve' | 'bidask' }) {
  // Heights (out of 12) for four bars per variant
  const heights =
    variant === 'spot'   ? [8, 8, 8, 8] :
    variant === 'curve'  ? [4, 9, 9, 4] :
    /* bidask */           [9, 4, 4, 9];
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * 4}
          y={12 - h}
          width="3"
          height={h}
          rx="0.5"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
