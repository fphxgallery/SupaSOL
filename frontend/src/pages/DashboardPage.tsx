import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useActivePublicKey } from '../store/walletStore';
import { useClusterStore } from '../store/clusterStore';
import { useSolBalance } from '../hooks/useSolBalance';
import { useTokenBalances } from '../hooks/useTokenBalances';
import { usePrice, useSolPrice } from '../hooks/usePrice';
import { usePortfolio } from '../hooks/usePortfolio';
import { useTokenMetadata } from '../hooks/useTokenMetadata';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PriceChart } from '../components/charts/PriceChart';
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton';
import { TokenLogo } from '../components/ui/TokenLogo';
import { CreateWalletModal } from '../components/wallet/CreateWalletModal';
import { ImportWalletModal } from '../components/wallet/ImportWalletModal';
import { formatSol, formatUsd, formatUsdCompact, shortenPubkey } from '../utils/format';
import { MINTS, EXPLORER_BASE, RPC_URL } from '../config/constants';

function StatCard({ label, value, sub, accent, error, onRetry }: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs text-text-dim mb-1">{label}</p>
        <p className={`text-2xl font-bold ${error ? 'text-text-dim' : (accent ?? 'text-text')}`}>{value}</p>
        {sub && !error && <p className="text-xs text-text-dim mt-1">{sub}</p>}
        {error && onRetry && (
          <button onClick={onRetry} className="text-xs text-blue hover:underline mt-1">
            Retry ↺
          </button>
        )}
      </CardBody>
    </Card>
  );
}

function TokenBalanceRow({ mint, uiAmount, prices, symbol, name, logoURI }: {
  mint: string;
  uiAmount: number | null;
  decimals: number;
  prices: Record<string, { usdPrice?: number }>;
  symbol?: string;
  name?: string;
  logoURI?: string;
}) {
  const price = prices[mint]?.usdPrice ?? null;
  const usdValue = price && uiAmount ? price * uiAmount : null;
  const displaySymbol = symbol ?? mint.slice(0, 4) + '…';
  const displayName = name ?? shortenPubkey(mint, 4);

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <TokenLogo mint={mint} symbol={displaySymbol} logoURI={logoURI} />
        <div>
          <p className="text-sm font-medium text-text">{displaySymbol}</p>
          <p className="text-xs text-text-dim">{displayName}</p>
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
  const rpcUrl = useClusterStore((s) => s.rpcUrl);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const {
    data: solBalance,
    isLoading: solLoading,
    isError: solError,
    refetch: refetchSol,
  } = useSolBalance(pubkey);

  const {
    data: tokenBalances,
    isLoading: tokensLoading,
    isError: tokensError,
    refetch: refetchTokens,
  } = useTokenBalances(pubkey);

  const solPrice = useSolPrice();

  // Fetch prices for all held tokens, not just the 4 hardcoded defaults
  const splMints = (tokenBalances ?? []).map((b) => b.mint);
  const allPriceMints = [MINTS.SOL, ...splMints.filter((m) => m !== MINTS.SOL)];
  const { data: prices } = usePrice(allPriceMints);

  const { data: portfolio } = usePortfolio(pubkey);

  // Fetch metadata (symbol, name, logoURI) for all held SPL tokens
  const tokenMeta = useTokenMetadata(splMints);

  const isLoadingBalances = solLoading || tokensLoading;
  const isUsingPublicRpc = rpcUrl === RPC_URL; // default public endpoint

  const solUi = typeof solBalance === 'number' ? solBalance / 1e9 : null;
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
      {/* RPC warning banner — shown when using the default public endpoint */}
      {isUsingPublicRpc && (solError || tokensError) && (
        <div className="flex items-center justify-between gap-3 bg-orange/10 border border-orange/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-orange text-sm shrink-0">⚠</span>
            <p className="text-xs text-text-dim">
              The public Solana RPC is rate-limited. Balances may fail to load.{' '}
              <Link to="/settings" className="text-blue hover:underline">Set a custom RPC ↗</Link>
            </p>
          </div>
          <button
            onClick={() => { refetchSol(); refetchTokens(); }}
            className="text-xs text-blue hover:underline shrink-0"
          >
            Retry ↺
          </button>
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoadingBalances && solBalance === undefined && !solError ? (
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
              value={solError ? '—' : totalUsd > 0 ? formatUsdCompact(totalUsd) : '—'}
              sub={solError ? undefined : 'All tokens'}
              error={solError}
              onRetry={() => { refetchSol(); refetchTokens(); }}
            />
            <StatCard
              label="SOL Balance"
              value={solUi !== null ? formatSol(solBalance!) : '—'}
              sub={
                solError ? undefined :
                solUsd !== null ? formatUsd(solUsd) :
                solLoading ? 'Loading...' :
                solUi !== null && solPrice === null ? 'Price unavailable' :
                undefined
              }
              accent="text-green"
              error={solError}
              onRetry={refetchSol}
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
              <div className="flex items-center gap-3">
                {(solError || tokensError) && (
                  <button
                    onClick={() => { refetchSol(); refetchTokens(); }}
                    className="text-xs text-orange hover:text-text transition-colors"
                    title="Refresh balances"
                  >
                    ↺ Retry
                  </button>
                )}
                <a
                  href={`${EXPLORER_BASE}/account/${pubkey}?cluster=${cluster}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue hover:underline"
                >
                  View on Solscan ↗
                </a>
              </div>
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
                {solLoading && solBalance === undefined ? (
                  <div className="w-16 h-4 bg-surface-2 rounded animate-pulse" />
                ) : solError ? (
                  <p className="text-xs text-text-dim">Unavailable</p>
                ) : (
                  <>
                    <p className="text-sm text-text">{solUi !== null ? solUi.toFixed(4) : '—'}</p>
                    {solUsd !== null && <p className="text-xs text-text-dim">{formatUsd(solUsd)}</p>}
                  </>
                )}
              </div>
            </div>

            {/* SPL + Token-2022 tokens */}
            {tokensLoading && !tokenBalances ? (
              <SkeletonTable rows={3} />
            ) : tokensError ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-sm text-text-dim">Failed to load token balances.</p>
                <button onClick={() => refetchTokens()} className="text-xs text-blue hover:underline">
                  Retry ↺
                </button>
              </div>
            ) : (tokenBalances ?? []).length === 0 ? (
              <p className="text-sm text-text-dim py-4 text-center">No tokens found</p>
            ) : (
              (tokenBalances ?? []).map((b) => (
                <TokenBalanceRow
                  key={b.mint}
                  {...b}
                  prices={prices ?? {}}
                  symbol={tokenMeta[b.mint]?.symbol}
                  name={tokenMeta[b.mint]?.name}
                  logoURI={tokenMeta[b.mint]?.logoURI}
                />
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
                      {p ? formatUsd(p) : <span className="text-text-dim">—</span>}
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
