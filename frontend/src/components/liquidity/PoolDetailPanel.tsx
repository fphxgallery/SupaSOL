import { TokenLogo } from '../ui/TokenLogo';
import { formatUsdCompact } from '../../utils/format';
import type { MeteoraPairInfo } from '../../api/dlmm';

interface Props {
  pool: MeteoraPairInfo;
  onAddLiquidity: (pool: MeteoraPairInfo) => void;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-lg px-3 py-2 border border-border">
      <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold text-text mt-0.5">{value}</p>
    </div>
  );
}

function fmt(n: number | undefined, prefix = '$'): string {
  if (n == null || n === 0) return '—';
  return prefix + formatUsdCompact(n).replace('$', '');
}

function fmtPct(n: number | undefined): string {
  if (n == null) return '—';
  return n.toFixed(2) + '%';
}

export function PoolDetailPanel({ pool, onAddLiquidity }: Props) {
  const symX = pool.token_x?.symbol ?? pool.name?.split('-')[0] ?? 'X';
  const symY = pool.token_y?.symbol ?? pool.name?.split('-')[1] ?? 'Y';
  const apr = (pool.apr ?? 0) + (pool.farm_apr ?? 0);
  const vol24h = pool.volume?.['24h'];
  const fees24h = pool.fees?.['24h'];
  const feeTvl24h = pool.fee_tvl_ratio?.['24h'];
  const binStep = pool.pool_config?.bin_step;
  const baseFee = pool.pool_config?.base_fee_pct;
  const dynamicFee = pool.dynamic_fee_pct;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2 shrink-0">
          <TokenLogo mint={pool.token_x?.address} symbol={symX} size="lg" />
          <TokenLogo mint={pool.token_y?.address} symbol={symY} size="lg" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-text truncate">{pool.name}</h2>
          <p className="text-xs text-text-dim">
            {binStep != null ? `${binStep} bps bin step` : 'Meteora DLMM'}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="TVL" value={pool.tvl ? `$${formatUsdCompact(pool.tvl).replace('$', '')}` : '—'} />
        <StatBox label="APR" value={apr > 0 ? fmtPct(apr) : '—'} />
        <StatBox label="24h Volume" value={fmt(vol24h)} />
        <StatBox label="24h Fees" value={fmt(fees24h)} />
        <StatBox label="Fee / TVL" value={feeTvl24h != null ? (feeTvl24h * 100).toFixed(4) + '%' : '—'} />
        <StatBox label="Bin Step" value={binStep != null ? `${binStep} bps` : '—'} />
        <StatBox label="Base Fee" value={fmtPct(baseFee)} />
        <StatBox label="Dynamic Fee" value={fmtPct(dynamicFee)} />
      </div>

      {/* Add Liquidity button */}
      <button
        onClick={() => onAddLiquidity(pool)}
        className="mt-auto w-full py-2.5 rounded-xl bg-green text-bg font-bold text-sm hover:bg-green/90 transition-colors"
      >
        + Add Liquidity
      </button>
    </div>
  );
}
