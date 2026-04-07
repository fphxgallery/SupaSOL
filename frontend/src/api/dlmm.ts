import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import DLMM, { StrategyType } from '@meteora-ag/dlmm';
import { BN } from '@coral-xyz/anchor';
import { apiFetch } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeteoraPairInfo {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  reserve_x: string;
  reserve_y: string;
  reserve_x_amount: number;
  reserve_y_amount: number;
  bin_step: number;
  base_fee_percentage: string;
  max_fee_percentage: string;
  protocol_fee_percentage: string;
  liquidity: string;
  reward_mint_x: string;
  reward_mint_y: string;
  fees_24h: number;
  today_fees: number;
  trade_volume_24h: number;
  cumulative_trade_volume: string;
  cumulative_fee_volume: string;
  current_price: number;
  apr: number;
  apy: number;
  farm_apr: number;
  farm_apy: number;
  hide: boolean;
}

export interface MeteoraPairsResponse {
  pairs: MeteoraPairInfo[];
  total: number;
}

export interface UserPosition {
  poolAddress: string;
  positionPubkey: string;
  /** X token mint address */
  mintX: string;
  /** Y token mint address */
  mintY: string;
  lowerBinId: number;
  upperBinId: number;
  /** Human-readable X amount (e.g. "1.5") */
  totalXAmount: string;
  /** Human-readable Y amount */
  totalYAmount: string;
  /** Claimable fee X in base units (BN.toString()) */
  feeXRaw: string;
  /** Claimable fee Y in base units */
  feeYRaw: string;
  rewardOneRaw: string;
  rewardTwoRaw: string;
  version: string;
}

// ---------------------------------------------------------------------------
// Meteora REST API (via backend proxy)
// ---------------------------------------------------------------------------

export async function fetchPairInfo(poolAddress: string): Promise<MeteoraPairInfo> {
  return apiFetch<MeteoraPairInfo>(`/api/dlmm/pair/${poolAddress}`);
}

export async function fetchPairs(opts: {
  page?: number;
  limit?: number;
  search?: string;
  sortKey?: string;
  orderBy?: 'asc' | 'desc';
} = {}): Promise<MeteoraPairsResponse> {
  const qs = new URLSearchParams();
  if (opts.page !== undefined) qs.set('page', String(opts.page));
  if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
  if (opts.search) qs.set('search_term', opts.search);
  if (opts.sortKey) qs.set('sort_key', opts.sortKey);
  if (opts.orderBy) qs.set('order_by', opts.orderBy);
  return apiFetch<MeteoraPairsResponse>(`/api/dlmm/pairs?${qs}`);
}

// ---------------------------------------------------------------------------
// DLMM SDK — on-chain reads
// ---------------------------------------------------------------------------

/**
 * Fetch all DLMM positions for a user across all pools.
 * getAllLbPairPositionsByUser returns Map<poolAddress, PositionInfo>
 * where PositionInfo.lbPairPositionsData is Array<LbPosition>.
 */
export async function getUserPositions(
  connection: Connection,
  walletAddress: string
): Promise<UserPosition[]> {
  const userPubkey = new PublicKey(walletAddress);
  // Returns Map<string, PositionInfo> — one PositionInfo per pool
  const allPositions = await DLMM.getAllLbPairPositionsByUser(connection, userPubkey);

  const result: UserPosition[] = [];
  for (const [poolAddress, positionInfo] of allPositions.entries()) {
    // tokenX / tokenY from PositionInfo give us the mint addresses
    const mintX = positionInfo.tokenX.mint.address.toBase58();
    const mintY = positionInfo.tokenY.mint.address.toBase58();

    // lbPairPositionsData is Array<LbPosition> — one per open position in this pool
    for (const lbPos of positionInfo.lbPairPositionsData) {
      const data = lbPos.positionData;
      result.push({
        poolAddress,
        positionPubkey: lbPos.publicKey.toBase58(),
        mintX,
        mintY,
        lowerBinId: data.lowerBinId,
        upperBinId: data.upperBinId,
        totalXAmount: data.totalXAmount ?? '0',
        totalYAmount: data.totalYAmount ?? '0',
        feeXRaw: data.feeX?.toString() ?? '0',
        feeYRaw: data.feeY?.toString() ?? '0',
        rewardOneRaw: data.rewardOne?.toString() ?? '0',
        rewardTwoRaw: data.rewardTwo?.toString() ?? '0',
        version: String(lbPos.version ?? 1),
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// DLMM SDK — transaction builders
// ---------------------------------------------------------------------------

/**
 * Build legacy transactions to claim all swap fees + LM rewards for a pool's positions.
 * claimAllRewards takes positions: LbPosition[]
 */
export async function buildClaimRewardsTxs(
  connection: Connection,
  poolAddress: string,
  ownerAddress: string
): Promise<Transaction[]> {
  const poolPubkey = new PublicKey(poolAddress);
  const ownerPubkey = new PublicKey(ownerAddress);

  const dlmmPool = await DLMM.create(connection, poolPubkey);
  const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(ownerPubkey);

  if (userPositions.length === 0) return [];

  // claimAllRewards takes LbPosition[] directly
  const txs = await dlmmPool.claimAllRewards({
    owner: ownerPubkey,
    positions: userPositions,
  });

  return Array.isArray(txs) ? txs : [txs];
}

/**
 * Build legacy transactions to remove 100% of liquidity from a position and close it.
 * removeLiquidity uses fromBinId/toBinId/bps (not binIds array).
 * bps = 10000 means 100%.
 */
export async function buildRemoveAllLiquidityTxs(
  connection: Connection,
  poolAddress: string,
  ownerAddress: string,
  positionPubkey: string
): Promise<Transaction[]> {
  const poolPubkey = new PublicKey(poolAddress);
  const ownerPubkey = new PublicKey(ownerAddress);

  const dlmmPool = await DLMM.create(connection, poolPubkey);
  const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(ownerPubkey);

  const positionEntry = userPositions.find(
    (p) => p.publicKey.toBase58() === positionPubkey
  );
  if (!positionEntry) throw new Error('Position not found in this pool');

  const txs = await dlmmPool.removeLiquidity({
    user: ownerPubkey,
    position: positionEntry.publicKey,
    fromBinId: positionEntry.positionData.lowerBinId,
    toBinId: positionEntry.positionData.upperBinId,
    bps: new BN(10_000), // 100% = 10000 basis points
    shouldClaimAndClose: true,
  });

  return Array.isArray(txs) ? txs : [txs];
}

/**
 * Build legacy transactions to initialize a new position and add liquidity by strategy.
 * Uses initializePositionAndAddLiquidityByStrategy which creates position + adds in one tx.
 * The position keypair partially signs the returned transaction; the user must also sign.
 */
export async function buildAddLiquidityTxs(
  connection: Connection,
  poolAddress: string,
  ownerAddress: string,
  params: {
    totalXAmount: bigint;
    totalYAmount: bigint;
    /** Lower price bound */
    minPrice: number;
    /** Upper price bound */
    maxPrice: number;
    strategyType: 'Spot' | 'BidAsk' | 'Curve';
  }
): Promise<{ tx: Transaction; positionKeypair: Keypair }[]> {
  const poolPubkey = new PublicKey(poolAddress);
  const ownerPubkey = new PublicKey(ownerAddress);

  const dlmmPool = await DLMM.create(connection, poolPubkey);

  // Convert prices to bin IDs
  const minBinId = dlmmPool.getBinIdFromPrice(params.minPrice, false);
  const maxBinId = dlmmPool.getBinIdFromPrice(params.maxPrice, true);

  if (minBinId >= maxBinId) {
    throw new Error('Min price bin must be less than max price bin — widen your range');
  }

  const strategyType =
    params.strategyType === 'BidAsk' ? StrategyType.BidAsk :
    params.strategyType === 'Curve'  ? StrategyType.Curve  :
    StrategyType.Spot;

  // Generate a new Keypair for this position
  const positionKeypair = Keypair.generate();

  const tx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: positionKeypair.publicKey,
    user: ownerPubkey,
    totalXAmount: new BN(params.totalXAmount.toString()),
    totalYAmount: new BN(params.totalYAmount.toString()),
    strategy: {
      maxBinId,
      minBinId,
      strategyType,
    },
    slippage: 1,
  });

  // Position keypair must be a signer — partialSign so user can sign separately
  tx.partialSign(positionKeypair);

  return [{ tx, positionKeypair }];
}
