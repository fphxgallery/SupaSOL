import { useActivePublicKey } from '../store/walletStore';
import { usePortfolio } from '../hooks/usePortfolio';
import { usePrice } from '../hooks/usePrice';
import { useSolBalance } from '../hooks/useSolBalance';
import { useTokenBalances } from '../hooks/useTokenBalances';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { formatUsd, formatUsdCompact, shortenPubkey } from '../utils/format';
import { MINTS } from '../config/constants';

const TYPE_VARIANT: Record<string, 'green' | 'blue' | 'orange' | 'purple' | 'muted'> = {
  trade: 'green',
  liquidity: 'blue',
  leverage: 'orange',
  borrowlend: 'purple',
  multiple: 'muted',
};

export function PortfolioPage() {
  const pubkey = useActivePublicKey();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(pubkey);
  const { data: solBalance } = useSolBalance(pubkey);
  const { data: tokenBalances } = useTokenBalances(pubkey);
  const { data: prices } = usePrice([MINTS.SOL, MINTS.USDC, MINTS.USDT, MINTS.JUP]);

  const solPrice = prices?.[MINTS.SOL]?.price ? parseFloat(prices[MINTS.SOL]!.price!) : null;
  const solUi = solBalance != null ? (solBalance as number) / 1e9 : null;
  const solUsd = solUi !== null && solPrice ? solUi * solPrice : null;

  const splUsd = (tokenBalances ?? []).reduce((acc, b) => {
    const p = prices?.[b.mint]?.price ? parseFloat(prices[b.mint]!.price!) : null;
    return acc + (p && b.uiAmount ? p * b.uiAmount : 0);
  }, 0);

  const jupiterUsd = (portfolio?.positions ?? []).reduce((acc, p) => acc + (p.value ?? 0), 0);
  const totalUsd = (solUsd ?? 0) + splUsd + jupiterUsd;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-text">Portfolio</h1>

      {!pubkey ? (
        <Card>
          <CardBody>
            <p className="text-sm text-text-dim text-center py-4">
              Connect a wallet to view your portfolio positions across all Jupiter platforms.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardBody>
                <p className="text-xs text-text-dim mb-1">Total Value</p>
                <p className="text-xl font-bold text-text">{totalUsd > 0 ? formatUsdCompact(totalUsd) : '—'}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-text-dim mb-1">SOL</p>
                <p className="text-xl font-bold text-purple">{solUsd !== null ? formatUsdCompact(solUsd) : '—'}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-text-dim mb-1">Tokens</p>
                <p className="text-xl font-bold text-blue">{splUsd > 0 ? formatUsdCompact(splUsd) : '—'}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-text-dim mb-1">Jupiter DeFi</p>
                <p className="text-xl font-bold text-orange">{jupiterUsd > 0 ? formatUsdCompact(jupiterUsd) : '—'}</p>
              </CardBody>
            </Card>
          </div>

          {/* Token holdings */}
          <Card>
            <CardHeader title="Token Holdings" subtitle={`${(tokenBalances?.length ?? 0) + 1} assets`} />
            <CardBody className="p-0">
              {/* SOL */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-purple/20 border border-purple/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-purple">◎</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text">SOL</p>
                    <p className="text-xs text-text-dim">Native Solana</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-text">{solUi?.toFixed(4) ?? '—'} SOL</p>
                  {solUsd !== null && <p className="text-xs text-text-dim">{formatUsd(solUsd)}</p>}
                </div>
              </div>
              {/* SPL tokens */}
              {(tokenBalances ?? []).map((b) => {
                const p = prices?.[b.mint]?.price ? parseFloat(prices[b.mint]!.price!) : null;
                const usd = p && b.uiAmount ? p * b.uiAmount : null;
                return (
                  <div key={b.mint} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center">
                        <span className="text-xs text-text-dim font-mono">{b.mint[0]}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text font-mono">{shortenPubkey(b.mint, 4)}</p>
                        <p className="text-xs text-text-dim">{b.decimals} decimals</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-text">{b.uiAmount?.toLocaleString('en-US', { maximumFractionDigits: 4 })}</p>
                      {usd !== null && <p className="text-xs text-text-dim">{formatUsd(usd)}</p>}
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          {/* Jupiter DeFi positions */}
          <Card>
            <CardHeader
              title="Jupiter DeFi Positions"
              subtitle={portfolioLoading ? 'Loading...' : `${portfolio?.positions.length ?? 0} positions`}
            />
            <CardBody className="p-0">
              {portfolioLoading ? (
                <div className="flex items-center justify-center py-8 text-text-dim text-sm">
                  <span className="animate-spin mr-2">⟳</span> Fetching positions...
                </div>
              ) : !portfolio?.positions.length ? (
                <p className="text-sm text-text-dim text-center py-8">No Jupiter DeFi positions found</p>
              ) : (
                <div className="divide-y divide-border">
                  {portfolio.positions.map((pos) => (
                    <div key={pos.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Badge variant={TYPE_VARIANT[pos.type] ?? 'muted'}>{pos.type}</Badge>
                        <div>
                          <p className="text-sm font-medium text-text">{pos.name ?? pos.platform}</p>
                          <p className="text-xs text-text-dim">{pos.platform}</p>
                        </div>
                      </div>
                      {pos.value !== undefined && (
                        <span className="text-sm text-text font-medium">{formatUsd(pos.value)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
