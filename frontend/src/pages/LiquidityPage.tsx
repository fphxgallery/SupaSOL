import { useState } from 'react';
import { useActivePublicKey } from '../store/walletStore';
import { useUserPositions, useClaimRewards, useRemoveLiquidity } from '../hooks/useDlmm';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SkeletonCard } from '../components/ui/Skeleton';
import { PositionCard } from '../components/liquidity/PositionCard';
import { PoolSearchModal } from '../components/liquidity/PoolSearchModal';
import { AddLiquidityModal } from '../components/liquidity/AddLiquidityModal';
import { formatUsd } from '../utils/format';
import type { MeteoraPairInfo } from '../api/dlmm';

function EmptyPositions({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-2xl">
        ◈
      </div>
      <div>
        <h3 className="text-base font-bold text-text mb-1">No active positions</h3>
        <p className="text-sm text-text-dim max-w-xs">
          Provide liquidity to Meteora DLMM pools and earn dynamic fees.
        </p>
      </div>
      <Button onClick={onAdd}>+ Add Liquidity</Button>
    </div>
  );
}

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-xs text-text-dim mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent ?? 'text-text'}`}>{value}</p>
    </div>
  );
}

export function LiquidityPage() {
  const pubkey = useActivePublicKey();
  const [showPoolSearch, setShowPoolSearch] = useState(false);
  const [selectedPool, setSelectedPool] = useState<MeteoraPairInfo | null>(null);
  const [showAddLiquidity, setShowAddLiquidity] = useState(false);

  const { data: positions, isLoading, isError, refetch } = useUserPositions(pubkey);
  const { mutate: claimRewards, isPending: isClaiming, variables: claimingVars } = useClaimRewards();
  const { mutate: removeLiquidity, isPending: isRemoving, variables: removingVars } = useRemoveLiquidity();

  const posCount = positions?.length ?? 0;
  // Claimable fees exist if any position has non-zero fee amounts
  const hasClaimable = positions?.some(
    (p) => BigInt(p.feeXRaw) + BigInt(p.feeYRaw) > 0n
  ) ?? false;

  function handleClaimAll() {
    if (!pubkey || !positions) return;
    // Claim pool by pool for positions with fees
    const poolsWithFees = [
      ...new Set(
        positions
          .filter((p) => BigInt(p.feeXRaw) + BigInt(p.feeYRaw) > 0n)
          .map((p) => p.poolAddress)
      ),
    ];
    for (const poolAddress of poolsWithFees) {
      claimRewards({ poolAddress, ownerAddress: pubkey });
    }
  }

  function handleAddLiquidityFlow() {
    setShowPoolSearch(true);
  }

  function handlePoolSelected(pool: MeteoraPairInfo) {
    setSelectedPool(pool);
    setShowAddLiquidity(true);
  }

  if (!pubkey) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-bold text-text">Liquidity</h1>
        <Card>
          <CardBody>
            <p className="text-sm text-text-dim text-center py-4">
              Connect a wallet to view and manage your Meteora DLMM liquidity positions.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text">Liquidity</h1>
          <p className="text-xs text-text-dim mt-0.5">Meteora DLMM · Dynamic fee market making</p>
        </div>
        <div className="flex items-center gap-2">
          {hasClaimable && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClaimAll}
              disabled={isClaiming}
            >
              {isClaiming ? 'Claiming…' : '✦ Claim All Fees'}
            </Button>
          )}
          <Button size="sm" onClick={handleAddLiquidityFlow}>
            + Add Liquidity
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatPill
          label="Active Positions"
          value={isLoading ? '—' : String(posCount)}
          accent="text-green"
        />
        <StatPill
          label="Pools"
          value={isLoading ? '—' : String(
            new Set(positions?.map((p) => p.poolAddress) ?? []).size
          )}
        />
        <StatPill
          label="Claimable"
          value={hasClaimable ? 'Yes' : '—'}
          accent={hasClaimable ? 'text-orange' : undefined}
        />
      </div>

      {/* Positions list */}
      <Card>
        <CardHeader
          title="My Positions"
          subtitle={isLoading ? 'Loading…' : `${posCount} position${posCount !== 1 ? 's' : ''}`}
          action={
            <button
              onClick={() => refetch()}
              className="text-xs text-text-dim hover:text-text transition-colors"
              title="Refresh"
            >
              ↺
            </button>
          }
        />
        <CardBody>
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-text-dim">Failed to load positions.</p>
              <Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : posCount === 0 ? (
            <EmptyPositions onAdd={handleAddLiquidityFlow} />
          ) : (
            <div className="flex flex-col gap-3">
              {positions!.map((pos) => (
                <PositionCard
                  key={pos.positionPubkey}
                  position={pos}
                  onClaim={(poolAddress) => {
                    if (pubkey) claimRewards({ poolAddress, ownerAddress: pubkey });
                  }}
                  onRemove={(poolAddress, positionPubkey) => {
                    if (pubkey) removeLiquidity({ poolAddress, positionPubkey, ownerAddress: pubkey });
                  }}
                  isClaiming={isClaiming && claimingVars?.poolAddress === pos.poolAddress}
                  isRemoving={isRemoving && removingVars?.positionPubkey === pos.positionPubkey}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* About Meteora DLMM */}
      <Card>
        <CardBody>
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0">◈</span>
            <div>
              <p className="text-sm font-medium text-text mb-1">About Meteora DLMM</p>
              <p className="text-xs text-text-dim leading-relaxed">
                Dynamic Liquidity Market Maker (DLMM) is Meteora's concentrated liquidity protocol
                on Solana. Positions earn swap fees from every trade through the selected price bins.
                Use <span className="text-text">Spot</span> for balanced liquidity,{' '}
                <span className="text-text">Curve</span> to concentrate near current price,
                or <span className="text-text">Bid-Ask</span> for volatility-capturing strategies.
              </p>
              <a
                href="https://docs.meteora.ag"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue hover:underline mt-2 inline-block"
              >
                Read the docs ↗
              </a>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Modals */}
      <PoolSearchModal
        open={showPoolSearch}
        onClose={() => setShowPoolSearch(false)}
        onSelect={handlePoolSelected}
      />
      {selectedPool && pubkey && (
        <AddLiquidityModal
          open={showAddLiquidity}
          onClose={() => { setShowAddLiquidity(false); setSelectedPool(null); }}
          pool={selectedPool}
          ownerAddress={pubkey}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
