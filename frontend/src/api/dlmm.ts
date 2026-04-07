import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import DLMM, { StrategyType } from '@meteora-ag/dlmm';
import { BN } from '@coral-xyz/anchor';
import { apiFetch } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DlmmToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  is_verified?: boolean;
  price?: number;
}

interface TimeWindowed {
  '30m'?: number;
  '1h'?: number;
  '2h'?: number;
  '4h'?: number;
  '12h'?: number;
  '24h'?: number;
}

interface PoolConfig {
  bin_step?: number;
  base_fee_pct?: number;
  max_fee_pct?: number;
  protocol_fee_pct?: number;
  dynamic_fee_pct?: number;
}

export interface MeteoraPairInfo {
  address: string;
  name: string;
  token_x: DlmmToken;
  token_y: DlmmToken;
  reserve_x?: string;
  reserve_y?: string;
  token_x_amount?: number;
  token_y_amount?: number;
  tvl?: number;
  current_price?: number;
  apr?: number;
  apy?: number;
  farm_apr?: number;
  farm_apy?: number;
  has_farm?: boolean;
  dynamic_fee_pct?: number;
  pool_config?: PoolConfig;
  volume?: TimeWindowed;
  fees?: TimeWindowed;
  fee_tvl_ratio?: TimeWindowed;
  reward_mint_x?: string;
  reward_mint_y?: string;
}

export interface MeteoraPairsResponse {
  total: number;
  pages: number;
  current_page: number;
  page_size: number;
  data: MeteoraPairInfo[];
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

// Map our internal sort key names to the Meteora API's sort_by field names
const SORT_KEY_MAP: Record<string, string> = {
  feetvl:  'fee_tvl_ratio_24h',
  volume:  'volume_24h',
  apr:     'apr',
};

export async function fetchPairs(opts: {
  page?: number;
  limit?: number;
  search?: string;
  sortKey?: string;
  orderBy?: 'asc' | 'desc';
} = {}): Promise<MeteoraPairsResponse> {
  const qs = new URLSearchParams();
  // Meteora API is 1-based; our UI passes 0-based pages
  qs.set('page', String((opts.page ?? 0) + 1));
  if (opts.limit !== undefined) qs.set('page_size', String(opts.limit));
  if (opts.search) qs.set('query', opts.search);
  const sortField = SORT_KEY_MAP[opts.sortKey ?? 'feetvl'] ?? 'fee_tvl_ratio_24h';
  qs.set('sort_by', `${sortField}:${opts.orderBy ?? 'desc'}`);
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

  console.log('[buildAddLiquidityTxs] creating DLMM pool...', poolAddress);
  const dlmmPool = await DLMM.create(connection, poolPubkey);
  const decimalsX = dlmmPool.tokenX.mint.decimals;
  const decimalsY = dlmmPool.tokenY.mint.decimals;

  console.log('[buildAddLiquidityTxs] pool created', {
    activeBin: dlmmPool.lbPair.activeId,
    binStep: dlmmPool.lbPair.binStep,
    tokenX: dlmmPool.tokenX.publicKey.toBase58(),
    tokenY: dlmmPool.tokenY.publicKey.toBase58(),
    decimalsX,
    decimalsY,
  });

  // getBinIdFromPrice expects price in per-lamport units (raw token ratio), NOT UI price.
  // Convert: pricePerLamport = uiPrice * 10^(decimalsY - decimalsX)
  // e.g. for SOL(9)-USDC(6): $150 SOL → 150 * 10^(6-9) = 0.15 per lamport
  const toLamportMultiplier = Math.pow(10, decimalsY - decimalsX);
  const minPricePerLamport = params.minPrice * toLamportMultiplier;
  const maxPricePerLamport = params.maxPrice * toLamportMultiplier;

  // min=true  → round toward the lower bin (use for the lower price bound)
  // min=false → round toward the higher bin (use for the upper price bound)
  const minBinId = dlmmPool.getBinIdFromPrice(minPricePerLamport, true) - 1;
  const maxBinId = dlmmPool.getBinIdFromPrice(maxPricePerLamport, false) + 1;

  console.log('[buildAddLiquidityTxs] bin IDs', {
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    toLamportMultiplier,
    minPricePerLamport,
    maxPricePerLamport,
    minBinId,
    maxBinId,
    activeBinId: dlmmPool.lbPair.activeId,
    totalXAmount: params.totalXAmount.toString(),
    totalYAmount: params.totalYAmount.toString(),
    strategyType: params.strategyType,
  });

  if (minBinId >= maxBinId) {
    throw new Error('Min price bin must be less than max price bin — widen your range');
  }

  const strategyType =
    params.strategyType === 'BidAsk' ? StrategyType.BidAsk :
    params.strategyType === 'Curve'  ? StrategyType.Curve  :
    StrategyType.Spot;

  // Generate a new Keypair for this position
  const positionKeypair = Keypair.generate();
  console.log('[buildAddLiquidityTxs] position keypair:', positionKeypair.publicKey.toBase58());

  console.log('[buildAddLiquidityTxs] calling initializePositionAndAddLiquidityByStrategy...');
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
  console.log('[buildAddLiquidityTxs] tx built', {
    numInstructions: tx.instructions.length,
    feePayer: tx.feePayer?.toBase58() ?? '(not set)',
    recentBlockhash: tx.recentBlockhash ?? '(not set)',
    signers: tx.signatures.map((s) => s.publicKey.toBase58()),
  });

  // Do NOT partialSign here — the blockhash hasn't been set yet.
  // The caller must sign with positionKeypair AFTER setting recentBlockhash.
  return [{ tx, positionKeypair }];
}
