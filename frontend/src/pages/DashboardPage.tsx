import { useState } from 'react';
import { useActivePublicKey } from '../store/walletStore';
import { useClusterStore } from '../store/clusterStore';
import { useSolBalance } from '../hooks/useSolBalance';
import { useTokenBalances } from '../hooks/useTokenBalances';
import { usePrice, useSolPrice } from '../hooks/usePrice';
import { usePortfolio } from '../hooks/usePortfolio';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PriceChart } from '../components/charts/PriceChart';
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton';
import { TokenLogo } from '../components/ui/TokenLogo';
import { CreateWalletModal } from '../components/wallet/CreateWalletModal';
import { ImportWalletModal } from '../components/wallet/ImportWalletModal';
import { formatSol, formatUsd, formatUsdCompact, shortenPubkey } from '../utils/format';
import { MINTS, EXPLORER_BASE } from '../config/constants';

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs text-text-dim mb-1">{label}</p>
        <p className={`text-2xl font-bold ${accent ?? 'text-text'}`}>{value}</p>
        {sub && <p className="text-xs text-text-dim mt-1">{sub}</p>}
      </CardBody>
    </Card>
  );
}

function TokenBalanceRow({ mint, uiAmount, decimals, prices }: {
  mint: string;
  uiAmount: number | null;
  decimals: number;
  prices: Record<string, { usdPrice?: number }>;
}) {
  const price = prices[mint]?.usdPrice ?? null;
  const usdValue = price && uiAmount ? price * uiAmount : null;
  const symbols: Record<string, string> = {
    [MINTS.USDC]: 'USDC', [MINTS.USDT]: 'USDT', [MINTS.JUP]: 'JUP',
  };
  const symbol = symbols[mint] ?? mint.slice(0, 4) + '…';

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <TokenLogo mint={mint} symbol={symbol} />
        <div>
          <p className="text-sm font-medium text-text">{symbol}</p>
          <p className="text-xs text-text-dim font-mono">{shortenPubkey(mint, 4)}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm text-text">{uiAmount?.toLocaleString('en-US', { maximumFractionDigits: 4 })}</p>
        {usdValue !== null && <p className="text-xs text-text-dim">{formatUsd(usdValue)}</p>}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const pubkey = useActivePublicKey();
  const cluster = useClusterStore((s) => s.cluster);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data: solBalance, isLoading: solLoading } = useSolBalance(pubkey);
  const { data: tokenBalances, isLoading: tokensLoading } = useTokenBalances(pubkey);
  const solPrice = useSolPrice();
  const { data: prices } = usePrice([MINTS.SOL, MINTS.USDC, MINTS.USDT, MINTS.JUP]);
  const { data: portfolio } = usePortfolio(pubkey);

  const isLoadingBalances = solLoading || tokensLoading;

  const solUi = solBalance !== null && solBalance !== undefined ? solBalance / 1e9 : null;
  const solUsd = solUi !== null && solPrice ? solUi * solPrice : null;

  // Total portfolio value
  const tokenUsd = (tokenBalances ?? []).reduce((acc, b) => {
    const p = prices?.[b.mint]?.usdPrice ?? null;
    return acc + (p && b.uiAmount ? p * b.uiAmount : 0);
  }, 0);
  const totalUsd = (solUsd ?? 0) + tokenUsd;

  if (!pubkey) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
          <div className="text-6xl">⚡</div>
          <div>
            <h1 className="text-2xl font-bold text-text mb-2">Welcome to SupaSOL</h1>
            <p className="text-text-dim max-w-md">
              A full-featured Solana trading terminal powered by Jupiter. Create or import a wallet to get started.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowImport(true)}>Import Wallet</Button>
            <Button onClick={() => setShowCreate(true)}>Create New Wallet</Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 max-w-2xl w-full">
            {['Swap', 'Lend / Earn', 'Limit Orders', 'DCA'].map((f) => (
              <div key={f} className="bg-surface border border-border rounded-xl p-4 text-center">
                <p className="text-sm font-medium text-text">{f}</p>
                <p className="text-xs text-text-dim mt-1">Jupiter-powered</p>
              </div>
            ))}
          </div>
        </div>
        <CreateWalletModal open={showCreate} onClose={() => setShowCreate(false)} />
        <ImportWalletModal open={showImport} onClose={() => setShowImport(false)} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoadingBalances && solBalance === undefined ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              label="Total Value"
              value={totalUsd > 0 ? formatUsdCompact(totalUsd) : '—'}
              sub="All tokens"
            />
            <StatCard
              label="SOL Balance"
              value={solUi !== null ? formatSol(solBalance!) : '—'}
              sub={solUsd !== null ? formatUsd(solUsd) : 'Loading price...'}
              accent="text-green"
            />
            <StatCard
              label="SOL Price"
              value={solPrice !== null ? formatUsd(solPrice) : '—'}
              sub="via Jupiter Price v3"
            />
            <StatCard
              label="Portfolio Positions"
              value={String(portfolio?.positions.length ?? 0)}
              sub="Jupiter platforms"
            />
          </>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Token balances */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Token Balances"
            action={
              <a
                href={`${EXPLORER_BASE}/account/${pubkey}?cluster=${cluster}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue hover:underline"
              >
                View on Solscan ↗
              </a>
            }
          />
          <CardBody className="p-0 px-4">
            {/* SOL row */}
            <div className="flex items-center justify-between py-2.5 border-b border-border">
              <div className="flex items-center gap-3">
                <TokenLogo mint={MINTS.SOL} symbol="SOL" />
                <div>
                  <p className="text-sm font-medium text-text">SOL</p>
                  <p className="text-xs text-text-dim">Native</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-text">{solUi !== null ? solUi.toFixed(4) : '—'}</p>
                {solUsd !== null && <p className="text-xs text-text-dim">{formatUsd(solUsd)}</p>}
              </div>
            </div>
            {/* SPL tokens */}
            {tokensLoading && !tokenBalances ? (
              <SkeletonTable rows={3} />
            ) : (tokenBalances ?? []).length === 0 ? (
              <p className="text-sm text-text-dim py-4 text-center">No SPL tokens found</p>
            ) : (
              (tokenBalances ?? []).map((b) => (
                <TokenBalanceRow key={b.mint} {...b} prices={prices ?? {}} />
              ))
            )}
          </CardBody>
        </Card>

        {/* SOL Price Chart */}
        <Card>
          <CardHeader
            title="SOL / USD"
            subtitle={solPrice !== null ? formatUsd(solPrice) : 'Loading...'}
          />
          <CardBody>
            <PriceChart
              mint={MINTS.SOL}
              symbol="SOL"
              color="#a855f7"
              height={180}
            />
            {/* Price ticker mini-list */}
            <div className="flex flex-col gap-0 mt-3 border-t border-border pt-3">
              {[
                { label: 'USDC', mint: MINTS.USDC, accent: 'text-blue' },
                { label: 'USDT', mint: MINTS.USDT, accent: 'text-green' },
                { label: 'JUP', mint: MINTS.JUP, accent: 'text-orange' },
              ].map(({ label, mint, accent }) => {
                const p = prices?.[mint]?.usdPrice;
                return (
                  <div key={mint} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${accent}`}>●</span>
                      <span className="text-sm font-medium text-text">{label}</span>
                    </div>
                    <span className="text-sm text-text font-mono">
                      {p ? formatUsd(parseFloat(p)) : <span className="text-text-dim">—</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Portfolio positions */}
      {(portfolio?.positions.length ?? 0) > 0 && (
        <Card>
          <CardHeader title="Jupiter Positions" subtitle={`${portfolio!.positions.length} active positions`} />
          <CardBody className="p-0">
            <div className="divide-y divide-border">
              {portfolio!.positions.map((pos) => (
                <div key={pos.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-text">{pos.name ?? pos.platform}</p>
                    <p className="text-xs text-text-dim">{pos.platform}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {pos.value !== undefined && (
                      <span className="text-sm text-text">{formatUsd(pos.value)}</span>
                    )}
                    <Badge variant="muted">{pos.type}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
