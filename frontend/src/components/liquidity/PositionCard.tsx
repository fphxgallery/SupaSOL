import { useState } from 'react';
import { Card, CardBody } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { TokenLogo } from '../ui/TokenLogo';
import { usePoolInfo } from '../../hooks/useDlmm';
import { shortenPubkey } from '../../utils/format';
import type { UserPosition } from '../../api/dlmm';

interface PositionCardProps {
  position: UserPosition;
  onClaim: (poolAddress: string) => void;
  onRemove: (poolAddress: string, positionPubkey: string) => void;
  isClaiming: boolean;
  isRemoving: boolean;
}

function formatTokenAmount(raw: string, decimals: number, maxDecimals = 4): string {
  const n = Number(raw) / Math.pow(10, decimals);
  if (isNaN(n) || n === 0) return '0';
  if (n < 0.0001) return '<0.0001';
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}

function hasFees(pos: UserPosition): boolean {
  return (BigInt(pos.feeXRaw) + BigInt(pos.feeYRaw)) > 0n;
}

function hasRewards(pos: UserPosition): boolean {
  return (BigInt(pos.rewardOneRaw) + BigInt(pos.rewardTwoRaw)) > 0n;
}

function hasLiquidity(pos: UserPosition): boolean {
  return pos.totalXAmount !== '0' || pos.totalYAmount !== '0';
}

export function PositionCard({
  position,
  onClaim,
  onRemove,
  isClaiming,
  isRemoving,
}: PositionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: poolInfo, isLoading: poolLoading } = usePoolInfo(position.poolAddress);

  // Read decimals from pool metadata; fall back to SOL=9 / USDC=6
  const tokenXDecimals = poolInfo?.token_x?.decimals ?? 9;
  const tokenYDecimals = poolInfo?.token_y?.decimals ?? 6;

  // Prefer symbol from token objects; fall back to parsing the pair name
  const symbolX = poolInfo?.token_x?.symbol ?? poolInfo?.name?.split('-')[0] ?? 'Token X';
  const symbolY = poolInfo?.token_y?.symbol ?? poolInfo?.name?.split('-')[1] ?? 'Token Y';

  const claimableX = hasFees(position) || hasRewards(position);
  const binRange = `${position.lowerBinId} – ${position.upperBinId}`;
  const binWidth = position.upperBinId - position.lowerBinId + 1;

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <CardBody className="pb-0">
        <div className="flex items-start justify-between gap-3">
          {/* Pool identity */}
          <div className="flex items-center gap-3 min-w-0">
            {poolLoading ? (
              <div className="w-10 h-10 rounded-full bg-surface-2 animate-pulse" />
            ) : (
              <div className="flex -space-x-2">
                <TokenLogo mint={poolInfo?.token_x?.address ?? position.mintX} symbol={symbolX} size="md" />
                <TokenLogo mint={poolInfo?.token_y?.address ?? position.mintY} symbol={symbolY} size="md" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-text">
                  {poolLoading ? (
                    <span className="inline-block w-24 h-4 bg-surface-2 rounded animate-pulse" />
                  ) : (
                    poolInfo?.name ?? shortenPubkey(position.poolAddress, 4)
                  )}
                </p>
                {poolInfo?.pool_config?.bin_step !== undefined && (
                  <Badge variant="muted">{poolInfo.pool_config.bin_step} bps</Badge>
                )}
              </div>
              <p className="text-xs text-text-dim font-mono mt-0.5">
                {shortenPubkey(position.positionPubkey, 4)}
              </p>
            </div>
          </div>

          {/* APR pill */}
          {poolInfo && (
            <div className="text-right shrink-0">
              <p className="text-xs text-text-dim">APR</p>
              <p className="text-sm font-bold text-green">
                {((poolInfo.apr ?? 0) + (poolInfo.farm_apr ?? 0)).toFixed(2)}%
              </p>
            </div>
          )}
        </div>

        {/* Liquidity amounts */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-surface-2 rounded-lg p-3">
            <p className="text-xs text-text-dim mb-1">{symbolX}</p>
            <p className="text-sm font-mono text-text">
              {formatTokenAmount(position.totalXAmount, tokenXDecimals)}
            </p>
          </div>
          <div className="bg-surface-2 rounded-lg p-3">
            <p className="text-xs text-text-dim mb-1">{symbolY}</p>
            <p className="text-sm font-mono text-text">
              {formatTokenAmount(position.totalYAmount, tokenYDecimals)}
            </p>
          </div>
        </div>

        {/* Fees row */}
        {claimableX && (
          <div className="mt-3 flex items-center justify-between bg-green/5 border border-green/20 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
              <span className="text-xs text-green font-medium">Claimable fees &amp; rewards</span>
            </div>
            <div className="text-xs text-text-dim">
              {formatTokenAmount(position.feeXRaw, tokenXDecimals)} {symbolX} +{' '}
              {formatTokenAmount(position.feeYRaw, tokenYDecimals)} {symbolY}
            </div>
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between py-2 mt-2 text-xs text-text-dim hover:text-text transition-colors"
        >
          <span>Bin range: {binRange} ({binWidth} bins)</span>
          <span>{expanded ? '▴' : '▾'} Details</span>
        </button>
      </CardBody>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-surface-2/50">
          <div className="grid grid-cols-2 gap-y-2 text-xs">
            <span className="text-text-dim">Pool address</span>
            <span className="text-text font-mono text-right">{shortenPubkey(position.poolAddress, 6)}</span>

            <span className="text-text-dim">Lower bin ID</span>
            <span className="text-text text-right">{position.lowerBinId}</span>

            <span className="text-text-dim">Upper bin ID</span>
            <span className="text-text text-right">{position.upperBinId}</span>

            {poolInfo && (
              <>
                <span className="text-text-dim">24h fees</span>
                <span className="text-text text-right">${(poolInfo.fees?.['24h'] ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>

                <span className="text-text-dim">24h volume</span>
                <span className="text-text text-right">${(poolInfo.volume?.['24h'] ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>

                {poolInfo.pool_config?.base_fee_pct !== undefined && (
                  <>
                    <span className="text-text-dim">Base fee</span>
                    <span className="text-text text-right">{poolInfo.pool_config.base_fee_pct}%</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 px-4 pb-4 pt-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => onClaim(position.poolAddress)}
          disabled={!claimableX || isClaiming}
        >
          {isClaiming ? 'Claiming…' : 'Claim Fees'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 !text-red hover:!bg-red/10"
          onClick={() => onRemove(position.poolAddress, position.positionPubkey)}
          disabled={isRemoving}
        >
          {isRemoving ? 'Removing…' : 'Remove & Close'}
        </Button>
      </div>
    </Card>
  );
}
