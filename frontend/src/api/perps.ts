import { apiFetch } from './client';

// ─── Symbol → Solana mint map (for PriceChart integration) ───────────────────

export const SYMBOL_TO_MINT: Record<string, string> = {
  SOL:     'So11111111111111111111111111111111111111112',
  BTC:     '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  ETH:     '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  JitoSOL: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
  JUP:     'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK:    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF:     'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  PYTH:    'HZ1JovNiVvGqSmqAwards3DHW9u29RatKHHyEMqVFxBdg',
  JTO:     'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
  RAY:     '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
};

// ─── Raw Flash Trade API shapes ───────────────────────────────────────────────

interface RawCustody {
  custodyAccount: string;
  symbol: string;
  priceUi?: string | number;
  maxLeverage?: string | number;
  openPositionFeeRate?: string | number;
}

interface RawPool {
  poolAddress: string;
  poolName: string;
  custodyStats: RawCustody[];
}

interface RawPriceEntry {
  name?: string;
  symbol?: string;
  price?: number;
  price_ui?: number;
  marketPubkey?: string;
  pubkey?: string;
}

interface RawPosition {
  positionPubkey?: string;
  marketPubkey?: string;
  custodyAccount?: string;  // Flash Trade uses this instead of marketPubkey
  ownerPubkey?: string;
  side?: string;
  collateral?: string | number;
  collateralUsd?: string | number;
  size?: string | number;
  sizeUsd?: string | number;
  entryPrice?: string | number;
  liquidationPrice?: string | number;
  leverage?: string | number;
  unrealizedPnl?: string | number;
  unrealizedPnlPercent?: string | number;
  pnlUi?: string | number;
  pnlPercent?: string | number;
  stopLossPrice?: string | number;
  takeProfitPrice?: string | number;
}

interface RawTxResponse {
  transactionBase64?: string;
  transaction?: string;
  err?: string | null;
  entryPrice?: string | number;
  liquidationPrice?: string | number;
  leverage?: string | number;
  size?: string | number;
  fee?: string | number;
}

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface PerpsMarket {
  pubkey: string;           // custodyAccount (positionIndex for open)
  poolPubkey: string;       // parent pool address
  symbol: string;           // e.g. "SOL"
  name: string;             // e.g. "SOL/USD"
  collateralCustody: string; // USDC custody account in same pool
  collateralDecimals: number;
  maxLeverage: number;
  currentPrice: number;     // UI price
}

export type PerpSide = 'long' | 'short';

export interface PerpsPosition {
  positionPubkey: string;
  marketPubkey: string;     // custody account
  symbol: string;
  side: PerpSide;
  collateral: number;       // USD
  size: number;             // USD
  entryPrice: number;
  liquidationPrice: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

export interface OpenPositionPreview {
  entryPrice: number;
  liquidationPrice: number;
  leverage: number;
  size: number;
  fee: number;
}

export interface OpenPositionParams {
  owner?: string;
  marketPubkey: string;
  side: PerpSide;
  collateralUi: number;
  collateralDecimals: number;
  leverage: number;
  markPriceUi: number;
  slippagePct?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPriceWithSlippage(
  priceUi: number,
  side: PerpSide,
  slippagePct = 0.005,
): { price: number; exponent: number } {
  const factor = side === 'long' ? 1 + slippagePct : 1 - slippagePct;
  return { price: Math.round(priceUi * factor * 1_000_000_000), exponent: -9 };
}

function toNum(v: string | number | undefined | null): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseFloat(String(v)) || 0;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function fetchPerpsMarkets(): Promise<PerpsMarket[]> {
  const resp = await apiFetch<{ pools?: RawPool[] } | RawPool[]>('/api/perps/pool-data');
  const pools: RawPool[] = Array.isArray(resp)
    ? (resp as RawPool[])
    : (resp as { pools?: RawPool[] }).pools ?? [];

  const markets: PerpsMarket[] = [];
  for (const pool of pools) {
    const custodies = pool.custodyStats ?? [];
    // USDC custody = the collateral token for this pool
    const usdcCustody = custodies.find((c) => c.symbol === 'USDC');
    const collateralCustody = usdcCustody?.custodyAccount ?? '';

    for (const c of custodies) {
      if (c.symbol === 'USDC') continue; // skip collateral token
      if (!c.custodyAccount) continue;
      const currentPrice = toNum(c.priceUi);
      // maxLeverage comes as a string like "1000.00" meaning 1000x — cap at UI limit
      const maxLeverage = Math.min(toNum(c.maxLeverage), 100);
      markets.push({
        pubkey: c.custodyAccount,
        poolPubkey: pool.poolAddress,
        symbol: c.symbol,
        name: `${c.symbol}/USD`,
        collateralCustody,
        collateralDecimals: 6,
        maxLeverage: maxLeverage || 100,
        currentPrice,
      });
    }
  }
  return markets;
}

export async function fetchPerpsPrices(): Promise<Record<string, number>> {
  const resp = await apiFetch<unknown>('/api/perps/prices');
  const result: Record<string, number> = {};
  if (Array.isArray(resp)) {
    for (const entry of resp as RawPriceEntry[]) {
      const key = entry.marketPubkey ?? entry.pubkey ?? entry.name ?? entry.symbol ?? '';
      const price = entry.price_ui ?? entry.price ?? 0;
      if (key && price) result[key] = typeof price === 'number' ? price : parseFloat(String(price));
    }
  } else if (resp && typeof resp === 'object') {
    for (const [k, v] of Object.entries(resp as Record<string, unknown>)) {
      if (typeof v === 'number') result[k] = v;
      else if (v && typeof v === 'object') {
        const e = v as RawPriceEntry;
        result[k] = e.price_ui ?? e.price ?? 0;
      }
    }
  }
  return result;
}

export async function fetchPerpsPositions(
  wallet: string,
  markets: PerpsMarket[],
): Promise<PerpsPosition[]> {
  const resp = await apiFetch<unknown>(`/api/perps/positions/${wallet}`);
  const marketsByPubkey = new Map(markets.map((m) => [m.pubkey, m]));
  const arr: RawPosition[] = Array.isArray(resp)
    ? (resp as RawPosition[])
    : Array.isArray((resp as { positions?: RawPosition[] }).positions)
    ? (resp as { positions: RawPosition[] }).positions
    : [];

  return arr
    .map((p): PerpsPosition | null => {
      const positionPubkey = p.positionPubkey ?? '';
      const marketPubkey = p.custodyAccount ?? p.marketPubkey ?? '';
      if (!positionPubkey) return null;
      const market = marketsByPubkey.get(marketPubkey);
      return {
        positionPubkey,
        marketPubkey,
        symbol: market?.symbol ?? marketPubkey.slice(0, 4),
        side: p.side === 'short' ? 'short' : 'long',
        collateral: toNum(p.collateralUsd ?? p.collateral),
        size: toNum(p.sizeUsd ?? p.size),
        entryPrice: toNum(p.entryPrice),
        liquidationPrice: toNum(p.liquidationPrice),
        leverage: toNum(p.leverage),
        unrealizedPnl: toNum(p.pnlUi ?? p.unrealizedPnl),
        unrealizedPnlPercent: toNum(p.pnlPercent ?? p.unrealizedPnlPercent),
        stopLossPrice: p.stopLossPrice != null ? toNum(p.stopLossPrice) : undefined,
        takeProfitPrice: p.takeProfitPrice != null ? toNum(p.takeProfitPrice) : undefined,
      };
    })
    .filter((p): p is PerpsPosition => p !== null);
}

// ─── Transaction builders ─────────────────────────────────────────────────────

function buildOpenBody(params: OpenPositionParams, includeOwner: boolean) {
  const collateralBase = Math.floor(
    params.collateralUi * Math.pow(10, params.collateralDecimals),
  );
  const sizeBase = Math.floor(collateralBase * params.leverage);
  const priceWithSlippage = toPriceWithSlippage(
    params.markPriceUi,
    params.side,
    params.slippagePct ?? 0.005,
  );
  return {
    ...(includeOwner && params.owner ? { owner: params.owner } : {}),
    positionIndex: params.marketPubkey,
    side: params.side,
    collateral: collateralBase,
    size: sizeBase,
    priceWithSlippage,
  };
}

export async function previewOpenPosition(
  params: OpenPositionParams,
): Promise<OpenPositionPreview> {
  const body = buildOpenBody(params, false);
  const resp = await apiFetch<RawTxResponse>('/api/perps/open', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (resp.err) throw new Error(resp.err);
  return {
    entryPrice: toNum(resp.entryPrice),
    liquidationPrice: toNum(resp.liquidationPrice),
    leverage: toNum(resp.leverage),
    size: toNum(resp.size),
    fee: toNum(resp.fee),
  };
}

export async function buildOpenPosition(
  params: OpenPositionParams,
): Promise<{ transaction: string }> {
  if (!params.owner) throw new Error('wallet required');
  const body = buildOpenBody(params, true);
  const resp = await apiFetch<RawTxResponse>('/api/perps/open', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned from Flash Trade');
  return { transaction: tx };
}

export async function buildClosePosition(
  owner: string,
  positionPubkey: string,
): Promise<{ transaction: string }> {
  const resp = await apiFetch<RawTxResponse>('/api/perps/close', {
    method: 'POST',
    body: JSON.stringify({ owner, positionIndex: positionPubkey }),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned');
  return { transaction: tx };
}

export async function buildAddCollateral(
  owner: string,
  positionPubkey: string,
  amountBase: number,
): Promise<{ transaction: string }> {
  const resp = await apiFetch<RawTxResponse>('/api/perps/add-collateral', {
    method: 'POST',
    body: JSON.stringify({ owner, positionIndex: positionPubkey, collateralDelta: amountBase }),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned');
  return { transaction: tx };
}

export async function buildRemoveCollateral(
  owner: string,
  positionPubkey: string,
  amountBase: number,
): Promise<{ transaction: string }> {
  const resp = await apiFetch<RawTxResponse>('/api/perps/remove-collateral', {
    method: 'POST',
    body: JSON.stringify({ owner, positionIndex: positionPubkey, collateralDelta: amountBase }),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned');
  return { transaction: tx };
}

export async function buildPlaceTriggerOrder(
  owner: string,
  positionPubkey: string,
  triggerPriceUi: number,
  isStopLoss: boolean,
): Promise<{ transaction: string }> {
  const triggerPrice = toPriceWithSlippage(triggerPriceUi, isStopLoss ? 'short' : 'long', 0);
  const resp = await apiFetch<RawTxResponse>('/api/perps/trigger', {
    method: 'POST',
    body: JSON.stringify({ owner, positionIndex: positionPubkey, triggerPrice, isStopLoss }),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned');
  return { transaction: tx };
}

export async function buildCancelTriggerOrder(
  owner: string,
  orderPubkey: string,
): Promise<{ transaction: string }> {
  const resp = await apiFetch<RawTxResponse>('/api/perps/cancel-trigger', {
    method: 'POST',
    body: JSON.stringify({ owner, orderIndex: orderPubkey }),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned');
  return { transaction: tx };
}
