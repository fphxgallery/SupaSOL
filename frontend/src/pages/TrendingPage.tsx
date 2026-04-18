import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrendingTokens, type TrendingInterval } from '../hooks/useTrendingTokens';
import { TokenInfoPanel } from '../components/panels/TokenInfoPanel';
import { TokenLogo } from '../components/ui/TokenLogo';
import { formatUsdCompact, formatPct } from '../utils/format';
import type { TrendingToken } from '../api/tokens';

const INTERVALS: { label: string; value: TrendingInterval }[] = [
  { label: '5m',  value: '5m' },
  { label: '1h',  value: '1h' },
  { label: '6h',  value: '6h' },
  { label: '24h', value: '24h' },
];

function formatTokenPrice(price: number | undefined): string {
  if (!price) return '—';
  if (price >= 1) return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const decimals = Math.max(2, -Math.floor(Math.log10(price)) + 2);
  return '$' + price.toFixed(Math.min(decimals, 10));
}

export function TrendingPage() {
  const navigate = useNavigate();
  const [interval, setInterval] = useState<TrendingInterval>('24h');
  const [selectedToken, setSelectedToken] = useState<TrendingToken | null>(null);

  const { data: tokens = [], isLoading, isError, refetch } = useTrendingTokens(interval);

  function handleBuy(token: TrendingToken, e: React.MouseEvent) {
    e.stopPropagation();
    navigate(`/swap?outputMint=${token.address}&outputSymbol=${encodeURIComponent(token.symbol)}`);
  }

  function handleRowClick(token: TrendingToken) {
    setSelectedToken(prev => prev?.address === token.address ? null : token);
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-text">Trending Tokens</h1>
          <p className="text-xs text-text-dim">Jupiter organic score — bot-filtered activity</p>
        </div>
        <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
          {INTERVALS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => { setInterval(value); setSelectedToken(null); }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                interval === value ? 'bg-green text-bg' : 'text-text-dim hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Token table */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">

            {/* Header row */}
            <div className="grid grid-cols-[32px_minmax(0,1fr)_90px_72px_84px_52px_64px] gap-x-3 px-4 py-2.5 border-b border-border text-[10px] font-semibold text-text-dim uppercase tracking-wide shrink-0">
              <span>#</span>
              <span>Token</span>
              <span className="text-right">Price</span>
              <span className="text-right">{interval}%</span>
              <span className="text-right">Volume</span>
              <span className="text-right">Score</span>
              <span />
            </div>

            {/* Scrollable rows */}
            <div className="overflow-y-auto flex-1">
              {isLoading && Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[32px_minmax(0,1fr)_90px_72px_84px_52px_64px] gap-x-3 px-4 py-3 border-b border-border/40 animate-pulse items-center">
                  <div className="h-3.5 w-5 bg-surface-2 rounded" />
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-surface-2 rounded-full shrink-0" />
                    <div className="h-3.5 w-24 bg-surface-2 rounded" />
                  </div>
                  <div className="h-3.5 w-16 bg-surface-2 rounded ml-auto" />
                  <div className="h-3.5 w-12 bg-surface-2 rounded ml-auto" />
                  <div className="h-3.5 w-14 bg-surface-2 rounded ml-auto" />
                  <div className="h-3.5 w-8 bg-surface-2 rounded ml-auto" />
                  <div className="h-6 w-12 bg-surface-2 rounded ml-auto" />
                </div>
              ))}

              {isError && (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <p className="text-text-dim text-sm">Failed to load trending tokens</p>
                  <button onClick={() => refetch()} className="text-xs text-green hover:underline">Retry</button>
                </div>
              )}

              {!isLoading && !isError && tokens.map((token, i) => {
                const stats = token.stats[interval];
                const change = stats?.priceChange;
                const volume = stats?.volume;
                const isSelected = selectedToken?.address === token.address;

                return (
                  <div
                    key={token.address}
                    onClick={() => handleRowClick(token)}
                    className={`grid grid-cols-[32px_minmax(0,1fr)_90px_72px_84px_52px_64px] gap-x-3 px-4 py-2.5 border-b border-border/40 cursor-pointer transition-colors items-center ${
                      isSelected ? 'bg-green/5 border-l-2 border-l-green' : 'hover:bg-surface-2'
                    }`}
                  >
                    {/* Rank */}
                    <span className="text-xs text-text-dim font-mono tabular-nums">{i + 1}</span>

                    {/* Logo + name */}
                    <div className="flex items-center gap-2 min-w-0">
                      <TokenLogo logoURI={token.logoURI} symbol={token.symbol} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-text truncate">{token.symbol}</span>
                          {token.audit?.isSus && <span className="text-[10px] text-red-400 shrink-0">⚠</span>}
                          {token.audit?.isMintable && <span className="text-[10px] text-orange shrink-0">M</span>}
                        </div>
                        <div className="text-[10px] text-text-dim truncate">{token.name}</div>
                      </div>
                    </div>

                    {/* Price */}
                    <span className="text-xs text-text text-right font-mono tabular-nums">
                      {formatTokenPrice(token.usdPrice)}
                    </span>

                    {/* Change */}
                    <span className={`text-xs text-right font-mono tabular-nums ${
                      change == null ? 'text-text-dim' : change >= 0 ? 'text-green' : 'text-red'
                    }`}>
                      {change == null ? '—' : formatPct(change)}
                    </span>

                    {/* Volume */}
                    <span className="text-xs text-text-dim text-right tabular-nums">
                      {volume ? formatUsdCompact(volume) : '—'}
                    </span>

                    {/* Organic score */}
                    <span className="text-xs text-text-dim text-right font-mono tabular-nums">
                      {token.organicScore != null ? token.organicScore.toFixed(0) : '—'}
                    </span>

                    {/* Buy */}
                    <button
                      onClick={(e) => handleBuy(token, e)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-green/10 text-green border border-green/20 hover:bg-green hover:text-bg transition-colors"
                    >
                      Buy
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Token info panel */}
        {selectedToken && (
          <div className="w-full lg:w-[340px] shrink-0">
            <TokenInfoPanel token={selectedToken} />
          </div>
        )}
      </div>
    </div>
  );
}
