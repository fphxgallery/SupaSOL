import { useState, useMemo } from 'react';
import { useActivePublicKey } from '../store/walletStore';
import {
  usePools,
  useUserPositions,
  usePoolInfo,
  useClaimRewards,
  useRemoveLiquidity,
} from '../hooks/useDlmm';
import { TokenLogo } from '../components/ui/TokenLogo';
import { PoolDetailPanel } from '../components/liquidity/PoolDetailPanel';
import { AddLiquidityModal } from '../components/liquidity/AddLiquidityModal';
import { formatUsdCompact } from '../utils/format';
import type { MeteoraPairInfo, UserPosition } from '../api/dlmm';

// ── helpers ──────────────────────────────────────────────────────────────────

function hasFees(pos: UserPosition): boolean {
  return (BigInt(pos.feeXRaw) + BigInt(pos.feeYRaw)) > 0n;
}

function formatAmt(raw: string, decimals: number): string {
  const n = Number(raw) / Math.pow(10, decimals);
  if (isNaN(n) || n === 0) return '0';
  if (n < 0.001) return '<0.001';
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

type SortKey = 'feetvl' | 'volume' | 'tvl';
type SortDir = 'asc' | 'desc';

function parseTvlInput(s: string): number {
  const v = s.trim().replace(/[$,]/g, '');
  if (!v) return NaN;
  const m = v.match(/^([\d.]+)\s*([kmb]?)$/i);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  const suffix = m[2].toLowerCase();
  if (suffix === 'k') return n * 1_000;
  if (suffix === 'm') return n * 1_000_000;
  if (suffix === 'b') return n * 1_000_000_000;
  return n;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-text-dim/40 ml-0.5">↕</span>;
  return <span className="text-green ml-0.5">{dir === 'asc' ? '↑' : '↓'}</span>;
}

// ── Position row (needs pool info) ───────────────────────────────────────────

function PositionRow({
  position,
  onClaim,
  onRemove,
  isClaiming,
  isRemoving,
}: {
  position: UserPosition;
  onClaim: (poolAddress: string) => void;
  onRemove: (poolAddress: string, positionPubkey: string) => void;
  isClaiming: boolean;
  isRemoving: boolean;
}) {
  const { data: poolInfo } = usePoolInfo(position.poolAddress);
  const symX = poolInfo?.token_x?.symbol ?? '?';
  const symY = poolInfo?.token_y?.symbol ?? '?';
  const decimalsX = poolInfo?.token_x?.decimals ?? 9;
  const decimalsY = poolInfo?.token_y?.decimals ?? 6;
  const apr = (poolInfo?.apr ?? 0) + (poolInfo?.farm_apr ?? 0);
  const bins = position.upperBinId - position.lowerBinId + 1;
  const claimable = hasFees(position);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_80px_80px_20px_56px_48px_auto] gap-x-3 px-4 py-3 border-b border-border/40 items-center hover:bg-surface-2 transition-colors">
      {/* Pool identity */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex -space-x-1.5 shrink-0">
          <TokenLogo mint={poolInfo?.token_x?.address ?? position.mintX} logoURI={poolInfo?.token_x?.logoURI} symbol={symX} size="sm" />
          <TokenLogo mint={poolInfo?.token_y?.address ?? position.mintY} logoURI={poolInfo?.token_y?.logoURI} symbol={symY} size="sm" />
        </div>
        <span className="text-sm font-semibold text-text truncate">
          {poolInfo?.name ?? `${position.mintX.slice(0, 4)}…/${position.mintY.slice(0, 4)}…`}
        </span>
      </div>

      {/* X amount */}
      <span className="text-xs text-text font-mono text-right tabular-nums">
        {formatAmt(position.totalXAmount, decimalsX)} <span className="text-text-dim">{symX}</span>
      </span>

      {/* Y amount */}
      <span className="text-xs text-text font-mono text-right tabular-nums">
        {formatAmt(position.totalYAmount, decimalsY)} <span className="text-text-dim">{symY}</span>
      </span>

      {/* Claimable dot */}
      <div className="flex justify-center">
        {claimable && (
          <span className="w-2 h-2 rounded-full bg-green animate-pulse" title="Fees claimable" />
        )}
      </div>

      {/* APR */}
      <span className="text-xs text-green text-right font-mono tabular-nums">
        {apr > 0 ? apr.toFixed(1) + '%' : '—'}
      </span>

      {/* Bins */}
      <span className="text-xs text-text-dim text-right tabular-nums">
        {bins}
      </span>

      {/* Actions */}
      <div className="flex gap-1.5 justify-end">
        <button
          onClick={() => onClaim(position.poolAddress)}
          disabled={!claimable || isClaiming}
          className="text-[11px] font-semibold px-2 py-1 rounded-md border border-green/20 text-green bg-green/5 hover:bg-green hover:text-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isClaiming ? '…' : 'Claim'}
        </button>
        <button
          onClick={() => onRemove(position.poolAddress, position.positionPubkey)}
          disabled={isRemoving}
          className="text-[11px] font-semibold px-2 py-1 rounded-md border border-red/20 text-red bg-red/5 hover:bg-red hover:text-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isRemoving ? '…' : 'Remove'}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LiquidityPage() {
  const pubkey = useActivePublicKey();

  // Tab
  const [tab, setTab] = useState<'pools' | 'positions'>('pools');

  // Pools state
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('feetvl');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [tvlMinInput, setTvlMinInput] = useState('25k');
  const [tvlMaxInput, setTvlMaxInput] = useState('');
  const [binStepInput, setBinStepInput] = useState('100');
  const [selectedPool, setSelectedPool] = useState<MeteoraPairInfo | null>(null);
  const [addLiquidityPool, setAddLiquidityPool] = useState<MeteoraPairInfo | null>(null);

  // Committed query state — only updated when Scan is clicked
  const [committed, setCommitted] = useState({ tvlMin: '25k', tvlMax: '', binStep: '100', sortKey: 'feetvl' as SortKey, sortDir: 'desc' as SortDir });

  function handleScan() {
    setCommitted({ tvlMin: tvlMinInput, tvlMax: tvlMaxInput, binStep: binStepInput, sortKey, sortDir });
  }

  // Hooks
  const minTvl = parseTvlInput(committed.tvlMin);
  const maxTvl = parseTvlInput(committed.tvlMax);

  // Always send user's sort key to server. min_tvl filtered client-side only —
  // Meteora ignores it for non-tvl sorts anyway, and forcing tvl:desc loses the right pools.
  const { data: poolsResp, isLoading: poolsLoading } = usePools({
    page: 0,
    limit: 100,
    search: search.length >= 2 ? search : undefined,
    sortKey: committed.sortKey,
    orderBy: committed.sortDir,
  });

  const { data: positions, isLoading: posLoading, isError: posError, refetch } = useUserPositions(pubkey);
  const { mutate: claimRewards, isPending: isClaiming, variables: claimVars } = useClaimRewards();
  const { mutate: removeLiquidity, isPending: isRemoving, variables: removeVars } = useRemoveLiquidity();

  // Client-side sort when TVL filter is active (server was forced to tvl:desc)
  const pools = useMemo(() => {
    let list = poolsResp?.data ?? [];

    if (!isNaN(minTvl)) list = list.filter(p => (p.tvl ?? 0) >= minTvl);
    if (!isNaN(maxTvl)) list = list.filter(p => (p.tvl ?? 0) <= maxTvl);
    const binStepVal = parseInt(committed.binStep, 10);
    if (!isNaN(binStepVal)) list = list.filter(p => (p.pool_config?.bin_step ?? 0) >= binStepVal);


    return list;
  }, [poolsResp, minTvl, maxTvl, committed]);

  const posCount = positions?.length ?? 0;
  const hasClaimable = positions?.some(p => hasFees(p)) ?? false;

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function handleClaimAll() {
    if (!pubkey || !positions) return;
    const pools = [...new Set(positions.filter(p => hasFees(p)).map(p => p.poolAddress))];
    for (const poolAddress of pools) claimRewards({ poolAddress, ownerAddress: pubkey });
  }

  const filtersActive = tvlMinInput !== '25k' || tvlMaxInput !== '' || binStepInput !== '100' || sortKey !== 'feetvl';

  // ── No wallet ──────────────────────────────────────────────────────────────
  if (!pubkey && tab === 'positions') {
    return (
      <div className="flex flex-col h-full min-h-0 p-4 gap-4">
        <h1 className="text-lg font-bold text-text">DLMM</h1>
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-text-dim">Connect a wallet to view your positions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-4 gap-3">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-text">DLMM</h1>
          <p className="text-xs text-text-dim">Meteora DLMM · Dynamic fee market making</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
            {(['pools', 'positions'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  tab === t ? 'bg-green text-bg' : 'text-text-dim hover:text-text'
                }`}
              >
                {t === 'pools' ? 'Pools' : `My Positions${posCount > 0 ? ` (${posCount})` : ''}`}
              </button>
            ))}
          </div>
          {/* Action buttons */}
          {tab === 'positions' && hasClaimable && (
            <button
              onClick={handleClaimAll}
              disabled={isClaiming}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-green/20 text-green bg-green/5 hover:bg-green hover:text-bg transition-colors disabled:opacity-50"
            >
              {isClaiming ? 'Claiming…' : '✦ Claim All Fees'}
            </button>
          )}
          {tab === 'positions' && (
            <button
              onClick={() => refetch()}
              className="text-xs text-text-dim hover:text-text transition-colors px-2 py-1.5"
              title="Refresh"
            >
              ↺
            </button>
          )}
        </div>
      </div>

      {/* ── Pools tab ──────────────────────────────────────────────────────── */}
      {tab === 'pools' && (
        <>
          {/* Search + sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 flex-1 min-w-[160px] focus-within:border-green/50 transition-colors">
              <svg className="w-3.5 h-3.5 text-text-dim shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search pools…"
                className="flex-1 bg-transparent text-sm text-text placeholder:text-text-dim outline-none min-w-0"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-text-dim hover:text-text shrink-0 text-xs">✕</button>
              )}
            </div>
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1 border border-border">
              {(['feetvl', 'volume', 'tvl'] as SortKey[]).map(key => (
                <button
                  key={key}
                  onClick={() => handleSort(key)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-0.5 ${
                    sortKey === key ? 'bg-green/20 text-green' : 'text-text-dim hover:text-text'
                  }`}
                >
                  {key === 'feetvl' ? 'Fee/TVL' : key === 'volume' ? 'Volume' : 'TVL'}
                  {sortKey === key && <SortIcon active dir={sortDir} />}
                </button>
              ))}
            </div>
          </div>

          {/* TVL filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-text-dim uppercase tracking-wide font-semibold shrink-0">TVL</span>
              <input
                type="text"
                placeholder="Min (e.g. 100k)"
                value={tvlMinInput}
                onChange={e => setTvlMinInput(e.target.value)}
                className="w-28 px-2 py-0.5 text-[11px] bg-surface-2 border border-border rounded-md text-text placeholder:text-text-dim/50 focus:outline-none focus:border-green/50"
              />
              <span className="text-[10px] text-text-dim">–</span>
              <input
                type="text"
                placeholder="Max (e.g. 1m)"
                value={tvlMaxInput}
                onChange={e => setTvlMaxInput(e.target.value)}
                className="w-28 px-2 py-0.5 text-[11px] bg-surface-2 border border-border rounded-md text-text placeholder:text-text-dim/50 focus:outline-none focus:border-green/50"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-text-dim uppercase tracking-wide font-semibold shrink-0">Step</span>
              <input
                type="text"
                placeholder="Any"
                value={binStepInput}
                onChange={e => setBinStepInput(e.target.value)}
                className="w-16 px-2 py-0.5 text-[11px] bg-surface-2 border border-border rounded-md text-text placeholder:text-text-dim/50 focus:outline-none focus:border-green/50"
              />
            </div>
            <button
              onClick={handleScan}
              disabled={poolsLoading}
              className="px-2.5 py-0.5 text-[11px] font-semibold rounded-md bg-green/20 text-green hover:bg-green/30 transition-colors disabled:opacity-50"
            >
              {poolsLoading ? 'Scanning…' : 'Scan'}
            </button>
            {filtersActive && (
              <button
                onClick={() => {
                  setTvlMinInput('25k'); setTvlMaxInput(''); setBinStepInput('100');
                  setSortKey('feetvl'); setSortDir('desc');
                  setCommitted({ tvlMin: '25k', tvlMax: '', binStep: '100', sortKey: 'feetvl', sortDir: 'desc' });
                }}
                className="text-[10px] text-text-dim hover:text-red transition-colors"
              >
                Reset
              </button>
            )}
            <span className="ml-auto text-[10px] text-text-dim">{pools.length} pools</span>
          </div>

          {/* Pool table + detail panel */}
          <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
            {/* Table */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
                {/* Header row */}
                <div className="grid grid-cols-[32px_minmax(0,1fr)_56px_84px_84px_72px] gap-x-3 px-4 py-2.5 border-b border-border text-[10px] font-semibold text-text-dim uppercase tracking-wide shrink-0">
                  <span>#</span>
                  <span>Pool</span>
                  <span className="text-right">Step</span>
                  <button onClick={() => handleSort('tvl')} className={`text-right flex items-center justify-end gap-0.5 hover:text-text transition-colors ${sortKey === 'tvl' ? 'text-text' : ''}`}>
                    TVL<SortIcon active={sortKey === 'tvl'} dir={sortDir} />
                  </button>
                  <button onClick={() => handleSort('volume')} className={`text-right flex items-center justify-end gap-0.5 hover:text-text transition-colors ${sortKey === 'volume' ? 'text-text' : ''}`}>
                    24h Vol<SortIcon active={sortKey === 'volume'} dir={sortDir} />
                  </button>
                  <button onClick={() => handleSort('feetvl')} className={`text-right flex items-center justify-end gap-0.5 hover:text-text transition-colors ${sortKey === 'feetvl' ? 'text-text' : ''}`}>
                    Fee/TVL<SortIcon active={sortKey === 'feetvl'} dir={sortDir} />
                  </button>
                </div>

                {/* Rows */}
                <div className="overflow-y-auto flex-1">
                  {poolsLoading && Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="grid grid-cols-[32px_minmax(0,1fr)_56px_84px_84px_72px] gap-x-3 px-4 py-3 border-b border-border/40 animate-pulse items-center">
                      <div className="h-3 w-4 bg-surface-2 rounded" />
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-surface-2 rounded-full shrink-0" />
                        <div className="w-6 h-6 bg-surface-2 rounded-full -ml-2 shrink-0" />
                        <div className="h-3 w-24 bg-surface-2 rounded" />
                      </div>
                      <div className="h-3 w-10 bg-surface-2 rounded ml-auto" />
                      <div className="h-3 w-14 bg-surface-2 rounded ml-auto" />
                      <div className="h-3 w-14 bg-surface-2 rounded ml-auto" />
                      <div className="h-3 w-10 bg-surface-2 rounded ml-auto" />
                    </div>
                  ))}

                  {!poolsLoading && pools.length === 0 && (
                    <div className="flex items-center justify-center py-16 text-sm text-text-dim">
                      No pools found
                    </div>
                  )}

                  {!poolsLoading && pools.map((pool, i) => {
                    const symX = pool.token_x?.symbol ?? pool.name?.split('-')[0] ?? 'X';
                    const symY = pool.token_y?.symbol ?? pool.name?.split('-')[1] ?? 'Y';
                    const apr = (pool.apr ?? 0) + (pool.farm_apr ?? 0);
                    const isSelected = selectedPool?.address === pool.address;

                    return (
                      <div
                        key={pool.address}
                        onClick={() => setSelectedPool(prev => prev?.address === pool.address ? null : pool)}
                        className={`grid grid-cols-[32px_minmax(0,1fr)_56px_84px_84px_72px] gap-x-3 px-4 py-2.5 border-b border-border/40 cursor-pointer transition-colors items-center ${
                          isSelected ? 'bg-green/5 border-l-2 border-l-green' : 'hover:bg-surface-2'
                        }`}
                      >
                        <span className="text-xs text-text-dim font-mono tabular-nums">{i + 1}</span>

                        {/* Pool identity */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex -space-x-1.5 shrink-0">
                            <TokenLogo mint={pool.token_x?.address} logoURI={pool.token_x?.logoURI} symbol={symX} size="sm" />
                            <TokenLogo mint={pool.token_y?.address} logoURI={pool.token_y?.logoURI} symbol={symY} size="sm" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-text truncate block">{pool.name}</span>
                          </div>
                        </div>

                        {/* Bin step */}
                        <span className="text-xs text-text-dim text-right tabular-nums">
                          {pool.pool_config?.bin_step != null ? `${pool.pool_config.bin_step}` : '—'}
                        </span>

                        {/* TVL */}
                        <span className="text-xs text-text-dim text-right tabular-nums">
                          {pool.tvl ? formatUsdCompact(pool.tvl) : '—'}
                        </span>

                        {/* 24h volume */}
                        <span className="text-xs text-text-dim text-right tabular-nums">
                          {pool.volume?.['24h'] ? formatUsdCompact(pool.volume['24h']) : '—'}
                        </span>

                        {/* APR */}
                        <span className="text-xs text-green text-right font-mono tabular-nums">
                          {apr > 0 ? apr.toFixed(1) + '%' : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Detail panel */}
            {selectedPool && (
              <div className="w-full lg:w-[300px] shrink-0">
                <div className="bg-surface border border-border rounded-xl p-4 h-full">
                  <PoolDetailPanel
                    pool={selectedPool}
                    onAddLiquidity={pool => { setAddLiquidityPool(pool); }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── My Positions tab ───────────────────────────────────────────────── */}
      {tab === 'positions' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
            {/* Header row */}
            <div className="grid grid-cols-[minmax(0,1fr)_80px_80px_20px_56px_48px_auto] gap-x-3 px-4 py-2.5 border-b border-border text-[10px] font-semibold text-text-dim uppercase tracking-wide shrink-0">
              <span>Pool</span>
              <span className="text-right">X</span>
              <span className="text-right">Y</span>
              <span />
              <span className="text-right">APR</span>
              <span className="text-right">Bins</span>
              <span />
            </div>

            {/* Rows */}
            <div className="overflow-y-auto flex-1">
              {posLoading && Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_80px_80px_20px_56px_48px_auto] gap-x-3 px-4 py-3 border-b border-border/40 animate-pulse items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-surface-2 rounded-full" />
                    <div className="w-6 h-6 bg-surface-2 rounded-full -ml-2" />
                    <div className="h-3 w-24 bg-surface-2 rounded" />
                  </div>
                  <div className="h-3 w-16 bg-surface-2 rounded ml-auto" />
                  <div className="h-3 w-16 bg-surface-2 rounded ml-auto" />
                  <div />
                  <div className="h-3 w-10 bg-surface-2 rounded ml-auto" />
                  <div className="h-3 w-8 bg-surface-2 rounded ml-auto" />
                  <div className="h-6 w-24 bg-surface-2 rounded ml-auto" />
                </div>
              ))}

              {posError && (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <p className="text-text-dim text-sm">Failed to load positions</p>
                  <button onClick={() => refetch()} className="text-xs text-green hover:underline">Retry</button>
                </div>
              )}

              {!posLoading && !posError && posCount === 0 && (
                <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                  <span className="text-3xl">◈</span>
                  <div>
                    <p className="text-sm font-semibold text-text">No active positions</p>
                    <p className="text-xs text-text-dim mt-1">Provide liquidity to earn dynamic fees</p>
                  </div>
                  <button
                    onClick={() => setTab('pools')}
                    className="text-xs font-semibold px-4 py-2 rounded-lg bg-green/10 text-green border border-green/20 hover:bg-green hover:text-bg transition-colors"
                  >
                    Browse Pools
                  </button>
                </div>
              )}

              {!posLoading && !posError && positions?.map(pos => (
                <PositionRow
                  key={pos.positionPubkey}
                  position={pos}
                  onClaim={poolAddress => { if (pubkey) claimRewards({ poolAddress, ownerAddress: pubkey }); }}
                  onRemove={(poolAddress, positionPubkey) => { if (pubkey) removeLiquidity({ poolAddress, positionPubkey, ownerAddress: pubkey }); }}
                  isClaiming={isClaiming && claimVars?.poolAddress === pos.poolAddress}
                  isRemoving={isRemoving && removeVars?.positionPubkey === pos.positionPubkey}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Add Liquidity Modal ─────────────────────────────────────────────── */}
      {addLiquidityPool && pubkey && (
        <AddLiquidityModal
          open={!!addLiquidityPool}
          onClose={() => setAddLiquidityPool(null)}
          pool={addLiquidityPool}
          ownerAddress={pubkey}
          onSuccess={() => { setAddLiquidityPool(null); refetch(); }}
        />
      )}
    </div>
  );
}
