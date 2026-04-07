import { useState, useMemo } from 'react';
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

const STRATEGIES = [
  {
    key: 'Spot' as const,
    label: 'Spot',
    desc: 'Balanced liquidity across the selected range. Best for stable pairs.',
  },
  {
    key: 'Curve' as const,
    label: 'Curve',
    desc: 'Concentrated liquidity near the current price. Maximizes capital efficiency.',
  },
  {
    key: 'BidAsk' as const,
    label: 'Bid-Ask',
    desc: 'Liquidity split away from current price — acts like a limit order spread.',
  },
];

export function AddLiquidityModal({
  open,
  onClose,
  pool,
  ownerAddress,
  onSuccess,
}: AddLiquidityModalProps) {
  const [strategy, setStrategy] = useState<'Spot' | 'BidAsk' | 'Curve'>('Spot');
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [loading, setLoading] = useState(false);

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
  // Use decimals from token metadata, fall back to SOL=9 / USDC=6
  const decimalsX = pool.token_x?.decimals ?? (mintX === MINTS.SOL ? 9 : 6);
  const decimalsY = pool.token_y?.decimals ?? 6;

  // DLMM position creation requires ~0.112 SOL in rent for new accounts
  // (position account + bin array + ATA). Reserve 0.15 SOL to be safe.
  const DLMM_RENT_RESERVE_LAMPORTS = 150_000_000; // 0.15 SOL

  // Resolve available wallet balance (in UI units) for each pool token
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

  // Show a SOL rent warning if SOL is one of the pool tokens
  const hasSolToken = mintX === MINTS.SOL || mintY === MINTS.SOL;

  // Derive the current X-per-Y price for pairing calculations.
  // Prefer pool.current_price (X denominated in Y, e.g. SOL in USDC).
  // Fall back to deriving from individual token USD prices if available.
  const priceXinY = useMemo(() => {
    if (pool.current_price && pool.current_price > 0) return pool.current_price;
    const px = pool.token_x?.price;
    const py = pool.token_y?.price;
    if (px && py && py > 0) return px / py;
    return null;
  }, [pool.current_price, pool.token_x?.price, pool.token_y?.price]);

  function handleChangeX(val: string) {
    setAmountX(val);
    if (priceXinY && val && !isNaN(parseFloat(val))) {
      const paired = parseFloat(val) * priceXinY;
      setAmountY(paired.toFixed(6).replace(/\.?0+$/, ''));
    } else if (!val) {
      setAmountY('');
    }
  }

  function handleChangeY(val: string) {
    setAmountY(val);
    if (priceXinY && val && !isNaN(parseFloat(val))) {
      const paired = parseFloat(val) / priceXinY;
      setAmountX(paired.toFixed(6).replace(/\.?0+$/, ''));
    } else if (!val) {
      setAmountX('');
    }
  }

  function handleSetX(val: string) {
    setAmountX(val);
    if (priceXinY && val && !isNaN(parseFloat(val))) {
      setAmountY((parseFloat(val) * priceXinY).toFixed(6).replace(/\.?0+$/, ''));
    }
  }

  function handleSetY(val: string) {
    setAmountY(val);
    if (priceXinY && val && !isNaN(parseFloat(val))) {
      setAmountX((parseFloat(val) / priceXinY).toFixed(6).replace(/\.?0+$/, ''));
    }
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

      // Pass position keypairs as extraSigners so they sign AFTER the blockhash is set.
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

  return (
    <Modal open={open} onClose={onClose} title={`Add Liquidity — ${pool.name}`} maxWidth="max-w-md">
      {/* Token pair header */}
      <div className="flex items-center gap-3 bg-surface-2 rounded-xl p-3 mb-4">
        <div className="flex -space-x-2">
          <TokenLogo mint={mintX} symbol={symX} size="md" />
          <TokenLogo mint={mintY} symbol={symY} size="md" />
        </div>
        <div>
          <p className="text-sm font-bold text-text">{pool.name}</p>
          <p className="text-xs text-text-dim">
            {pool.pool_config?.bin_step !== undefined && `Bin step: ${pool.pool_config.bin_step} bps · `}
            APR: {((pool.apr ?? 0) + (pool.farm_apr ?? 0)).toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Strategy selector */}
      <p className="text-xs text-text-dim font-medium uppercase tracking-wide mb-2">Strategy</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {STRATEGIES.map((s) => (
          <button
            key={s.key}
            onClick={() => setStrategy(s.key)}
            className={`flex flex-col gap-1 p-2.5 rounded-xl border text-left transition-all ${
              strategy === s.key
                ? 'border-green bg-green/10 text-text'
                : 'border-border bg-surface-2 text-text-dim hover:border-border-2 hover:text-text'
            }`}
          >
            <span className="text-xs font-bold">{s.label}</span>
            <span className="text-[10px] leading-snug">{s.desc}</span>
          </button>
        ))}
      </div>

      {/* Price range */}
      <p className="text-xs text-text-dim font-medium uppercase tracking-wide mb-2">Price Range</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[
          { label: 'Min Price', value: minPrice, set: setMinPrice },
          { label: 'Max Price', value: maxPrice, set: setMaxPrice },
        ].map(({ label, value, set }) => (
          <div key={label} className="bg-surface-2 border border-border rounded-xl p-3 focus-within:border-green/50 transition-colors">
            <p className="text-xs text-text-dim mb-1">{label}</p>
            <input
              type="number"
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent text-sm font-mono text-text outline-none"
            />
          </div>
        ))}
      </div>

      {/* SOL rent warning */}
      {hasSolToken && (
        <div className="flex items-start gap-2 bg-orange/10 border border-orange/20 rounded-lg px-3 py-2 mb-3">
          <span className="text-orange text-xs mt-0.5 shrink-0">⚠</span>
          <p className="text-xs text-orange">
            New DLMM positions reserve ~0.15 SOL for on-chain account rent (position, bin array, token accounts).
            This SOL is locked but recoverable when you close the position.
          </p>
        </div>
      )}

      {/* Amounts */}
      <p className="text-xs text-text-dim font-medium uppercase tracking-wide mb-2">Deposit Amounts</p>
      <div className="flex flex-col gap-2 mb-5">
        {([
          { label: symX, value: amountX, onChange: handleChangeX, onSet: handleSetX, balance: balanceX },
          { label: symY, value: amountY, onChange: handleChangeY, onSet: handleSetY, balance: balanceY },
        ] as const).map(({ label, value, onChange, onSet, balance }) => (
          <div key={label} className="bg-surface-2 border border-border rounded-xl px-3 py-2.5 focus-within:border-green/50 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-text-dim">{label}</span>
              {balance !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-dim">
                    Bal: {balance.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                  </span>
                  <button
                    onClick={() => onSet((balance / 2).toFixed(6).replace(/\.?0+$/, ''))}
                    className="text-xs text-blue hover:underline cursor-pointer"
                  >
                    50%
                  </button>
                  <button
                    onClick={() => onSet(balance.toFixed(6).replace(/\.?0+$/, ''))}
                    className="text-xs text-blue hover:underline cursor-pointer"
                  >
                    Max
                  </button>
                </div>
              )}
            </div>
            <input
              type="number"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent text-sm font-mono text-text outline-none text-right"
            />
          </div>
        ))}
      </div>

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
