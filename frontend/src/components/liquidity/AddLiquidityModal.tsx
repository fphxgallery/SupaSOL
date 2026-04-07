import { useState } from 'react';
import { Connection } from '@solana/web3.js';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TokenLogo } from '../ui/TokenLogo';
import { useSignAndSend } from '../../hooks/useSignAndSend';
import { useUiStore } from '../../store/uiStore';
import { useClusterStore } from '../../store/clusterStore';
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

  const symX = pool.token_x?.symbol ?? pool.name?.split('-')[0] ?? 'X';
  const symY = pool.token_y?.symbol ?? pool.name?.split('-')[1] ?? 'Y';
  const mintX = pool.token_x?.address;
  const mintY = pool.token_y?.address;
  // Use decimals from token metadata, fall back to SOL=9 / USDC=6
  const decimalsX = pool.token_x?.decimals ?? (mintX === 'So11111111111111111111111111111111111111112' ? 9 : 6);
  const decimalsY = pool.token_y?.decimals ?? 6;

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
    if (min >= max) {
      addToast({ type: 'error', message: 'Min price must be less than max price' });
      return;
    }

    setLoading(true);
    try {
      const xBase = BigInt(Math.floor(parseFloat(amountX || '0') * 10 ** decimalsX));
      const yBase = BigInt(Math.floor(parseFloat(amountY || '0') * 10 ** decimalsY));

      addToast({ type: 'info', message: 'Building add liquidity transactions...' });
      const connection = new Connection(rpcUrl, 'confirmed');
      const entries = await buildAddLiquidityTxs(connection, pool.address, ownerAddress, {
        totalXAmount: xBase,
        totalYAmount: yBase,
        minPrice: min,
        maxPrice: max,
        strategyType: strategy,
      });

      // buildAddLiquidityTxs returns { tx, positionKeypair }[] — extract just the transactions
      // each tx is already partially signed by the position keypair; signAndSendLegacy adds the user sig
      await signAndSendAllLegacy(entries.map((e) => e.tx), `Add Liquidity ${pool.name}`);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Add liquidity failed',
      });
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

      {/* Amounts */}
      <p className="text-xs text-text-dim font-medium uppercase tracking-wide mb-2">Deposit Amounts</p>
      <div className="flex flex-col gap-2 mb-5">
        {[
          { label: symX, value: amountX, set: setAmountX },
          { label: symY, value: amountY, set: setAmountY },
        ].map(({ label, value, set }) => (
          <div key={label} className="flex items-center gap-3 bg-surface-2 border border-border rounded-xl px-3 py-2.5 focus-within:border-green/50 transition-colors">
            <span className="text-sm font-medium text-text-dim w-12 shrink-0">{label}</span>
            <input
              type="number"
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-sm font-mono text-text outline-none text-right"
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
