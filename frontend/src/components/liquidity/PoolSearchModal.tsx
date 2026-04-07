import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { TokenLogo } from '../ui/TokenLogo';
import { usePools } from '../../hooks/useDlmm';
import type { MeteoraPairInfo } from '../../api/dlmm';

interface PoolSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (pool: MeteoraPairInfo) => void;
}

export function PoolSearchModal({ open, onClose, onSelect }: PoolSearchModalProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'feetvl' | 'volume' | 'apr'>('feetvl');

  const { data, isLoading } = usePools({
    page: 0,
    limit: 20,
    search: search.length >= 2 ? search : undefined,
    sortKey,
    orderBy: 'desc',
  });

  return (
    <Modal open={open} onClose={onClose} title="Select Pool" maxWidth="max-w-lg">
      {/* Search bar */}
      <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2 mb-3 focus-within:border-green/50 transition-colors">
        <svg className="w-3.5 h-3.5 text-text-dim shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pools… (e.g. SOL-USDC)"
          className="flex-1 bg-transparent text-sm text-text placeholder:text-text-dim outline-none"
          autoFocus
        />
      </div>

      {/* Sort tabs */}
      <div className="flex gap-1 mb-3">
        {(['feetvl', 'volume', 'apr'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`px-3 py-1 text-xs rounded-lg transition-colors ${
              sortKey === key
                ? 'bg-green/20 text-green font-medium'
                : 'text-text-dim hover:text-text hover:bg-surface-2'
            }`}
          >
            {key === 'feetvl' ? 'Fee/TVL' : key === 'volume' ? 'Volume' : 'APR'}
          </button>
        ))}
      </div>

      {/* Pool list */}
      <div className="flex flex-col gap-1 max-h-96 overflow-y-auto -mx-4 px-4">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-surface-2 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !data?.pairs.length ? (
          <p className="text-sm text-text-dim text-center py-8">No pools found</p>
        ) : (
          data.pairs.map((pool) => {
            const [symX, symY] = pool.name?.split('-') ?? ['X', 'Y'];
            return (
              <button
                key={pool.address}
                onClick={() => { onSelect(pool); onClose(); }}
                className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-2 transition-colors text-left border border-transparent hover:border-border"
              >
                {/* Token logos */}
                <div className="flex -space-x-2 shrink-0">
                  <TokenLogo mint={pool.mint_x} symbol={symX} size="sm" />
                  <TokenLogo mint={pool.mint_y} symbol={symY} size="sm" />
                </div>

                {/* Name + bin step */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">{pool.name}</span>
                    <Badge variant="muted">{pool.bin_step} bps</Badge>
                  </div>
                  <p className="text-xs text-text-dim mt-0.5">
                    TVL: ${Number(pool.liquidity ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </p>
                </div>

                {/* APR */}
                <div className="text-right shrink-0">
                  <p className="text-xs text-text-dim">APR</p>
                  <p className="text-sm font-bold text-green">
                    {(pool.apr + pool.farm_apr).toFixed(1)}%
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
