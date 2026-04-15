import { VersionedTransaction } from '@solana/web3.js';
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
  priceUi?: number;    // camelCase — Flash Trade /prices field name
  price_ui?: number;   // snake_case fallback
  exponent?: number;
  marketPubkey?: string;
  pubkey?: string;
}

interface RawPosition {
  key?: string;              // position pubkey
  marketSymbol?: string;     // e.g. "SOL"
  sideUi?: string;           // "Long" | "Short" (title case)
  collateralUsdUi?: string | number;
  sizeUsdUi?: string | number;
  sizeAmountUi?: string | number;  // asset units (e.g. 0.2361 SOL)
  entryPriceUi?: string | number;
  liquidationPriceUi?: string | number;
  leverageUi?: string | number;
  pnlWithFeeUsdUi?: string | number;
  pnlPercentageWithFee?: string | number;
  stopLossPrice?: string | number;
  takeProfitPrice?: string | number;
}

interface RawTxResponse {
  transactionBase64?: string;
  transaction?: string;
  err?: string | null;
  // Preview response fields (Flash Trade API uses "new" prefix)
  newEntryPrice?: string | number;
  newLiquidationPrice?: string | number;
  newLeverage?: string | number;
  youRecieveUsdUi?: string | number;  // position size in USD
  entryFee?: string | number;
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
  sizeAmount: number;       // asset units (e.g. SOL) — used for trigger orders
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
  marketSymbol: string;         // e.g. "SOL" — sent as outputTokenSymbol
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
      // Prefer priceUi (camelCase) or price_ui (snake_case) over raw oracle price
      const price = entry.priceUi ?? entry.price_ui ?? entry.price ?? 0;
      if (key && price) result[key] = typeof price === 'number' ? price : parseFloat(String(price));
    }
  } else if (resp && typeof resp === 'object') {
    // Flash Trade /prices: { SOL: { priceUi: 84.57, price: 8457268000, exponent: -8 }, ... }
    for (const [k, v] of Object.entries(resp as Record<string, unknown>)) {
      if (typeof v === 'number') {
        result[k] = v;
      } else if (v && typeof v === 'object') {
        const e = v as RawPriceEntry;
        result[k] = e.priceUi ?? e.price_ui ?? e.price ?? 0;
      }
    }
  }
  return result;
}

interface RawOrder {
  triggerPriceUi?: string | number;
  market?: string;    // custody pubkey
  symbol?: string;
  sideUi?: string;
}
interface RawOrdersResponse {
  takeProfitOrders?: RawOrder[];
  stopLossOrders?: RawOrder[];
}

export async function fetchPerpsPositions(
  wallet: string,
  markets: PerpsMarket[],
): Promise<PerpsPosition[]> {
  // Fetch positions and orders in parallel
  const [resp, ordersResp] = await Promise.all([
    apiFetch<unknown>(`/api/perps/positions/${wallet}`),
    apiFetch<RawOrdersResponse[]>(`/api/perps/orders/${wallet}`).catch(() => [] as RawOrdersResponse[]),
  ]);

  const arr: RawPosition[] = Array.isArray(resp)
    ? (resp as RawPosition[])
    : Array.isArray((resp as { positions?: RawPosition[] }).positions)
    ? (resp as { positions: RawPosition[] }).positions
    : [];

  // Flatten orders into symbol → { sl, tp } map
  const slBySymbol = new Map<string, number>();
  const tpBySymbol = new Map<string, number>();
  for (const entry of (ordersResp ?? [])) {
    for (const o of (entry.stopLossOrders ?? [])) {
      if (o.symbol && o.triggerPriceUi) slBySymbol.set(o.symbol, toNum(o.triggerPriceUi));
    }
    for (const o of (entry.takeProfitOrders ?? [])) {
      if (o.symbol && o.triggerPriceUi) tpBySymbol.set(o.symbol, toNum(o.triggerPriceUi));
    }
  }

  // Build a symbol → market map for lookup (positions response uses marketSymbol, not pubkey)
  const marketsBySymbol = new Map(markets.map((m) => [m.symbol, m]));

  return arr
    .map((p): PerpsPosition | null => {
      const positionPubkey = p.key ?? '';
      if (!positionPubkey) return null;
      const market = marketsBySymbol.get(p.marketSymbol ?? '');
      const rawSide = (p.sideUi ?? '').toLowerCase(); // "Long" → "long"
      const symbol = p.marketSymbol ?? market?.symbol ?? '???';
      return {
        positionPubkey,
        marketPubkey: market?.pubkey ?? '',
        symbol,
        side: rawSide === 'short' ? 'short' : 'long',
        collateral: toNum(p.collateralUsdUi),
        size: toNum(p.sizeUsdUi),
        sizeAmount: toNum(p.sizeAmountUi),
        entryPrice: toNum(p.entryPriceUi),
        liquidationPrice: toNum(p.liquidationPriceUi),
        leverage: toNum(p.leverageUi),
        unrealizedPnl: toNum(p.pnlWithFeeUsdUi),
        unrealizedPnlPercent: toNum(p.pnlPercentageWithFee),
        stopLossPrice: slBySymbol.get(symbol),
        takeProfitPrice: tpBySymbol.get(symbol),
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
    // Additional fields required by Flash Trade API
    inputTokenSymbol: 'USDC',
    outputTokenSymbol: params.marketSymbol,
    inputAmountUi: String(params.collateralUi),
    leverage: params.leverage,
    tradeType: params.side === 'long' ? 'LONG' : 'SHORT',
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
    entryPrice: toNum(resp.newEntryPrice),
    liquidationPrice: toNum(resp.newLiquidationPrice),
    leverage: toNum(resp.newLeverage),
    size: toNum(resp.youRecieveUsdUi),
    fee: toNum(resp.entryFee),
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
  sizeUsd: number,
): Promise<{ transaction: string }> {
  const resp = await apiFetch<RawTxResponse>('/api/perps/close', {
    method: 'POST',
    body: JSON.stringify({
      owner,
      positionKey: positionPubkey,
      inputUsdUi: String(sizeUsd),
      withdrawTokenSymbol: 'USDC',
    }),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned');
  return { transaction: tx };
}

export async function buildAddCollateral(
  owner: string,
  positionPubkey: string,
  amountUi: number,   // USDC UI amount (e.g. 10 for $10)
): Promise<{ transaction: string }> {
  const resp = await apiFetch<RawTxResponse>('/api/perps/add-collateral', {
    method: 'POST',
    body: JSON.stringify({
      owner,
      positionKey: positionPubkey,
      depositAmountUi: String(amountUi),
      depositTokenSymbol: 'USDC',
    }),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned');
  return { transaction: tx };
}

export async function buildRemoveCollateral(
  owner: string,
  positionPubkey: string,
  amountUsdUi: number,  // USD amount to withdraw (e.g. 5 for $5)
): Promise<{ transaction: string }> {
  const resp = await apiFetch<RawTxResponse>('/api/perps/remove-collateral', {
    method: 'POST',
    body: JSON.stringify({
      owner,
      positionKey: positionPubkey,
      withdrawAmountUsdUi: String(amountUsdUi),
      withdrawTokenSymbol: 'USDC',
    }),
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
  marketSymbol: string,
  side: PerpSide,
  sizeUsdUi: number,
): Promise<{ transaction: string }> {
  // Fetch the oracle exponent for this symbol so trigger price uses the correct scale.
  // SPY (equity) uses exponent -5; crypto uses -8. Sending the wrong exponent causes
  // program error 6039 "Exponent Mismatch between operands".
  const priceData = await apiFetch<Record<string, { exponent?: number }>>('/api/perps/prices');
  const oracleExponent: number = priceData[marketSymbol]?.exponent ?? -9;
  const triggerPriceRaw = Math.round(triggerPriceUi * Math.pow(10, -oracleExponent));

  const resp = await apiFetch<RawTxResponse>('/api/perps/trigger', {
    method: 'POST',
    body: JSON.stringify({
      owner,
      positionKey: positionPubkey,
      marketSymbol,
      side: side === 'long' ? 'LONG' : 'SHORT',
      triggerPriceUi: String(triggerPriceUi),
      triggerPrice: { price: triggerPriceRaw, exponent: oracleExponent },
      sizeAmountUi: String(sizeUsdUi),
      isStopLoss,
    }),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned');

  // The Flash Trade API hard-codes exponent -6 for all trigger prices, but equity oracles
  // (e.g. SPY) use exponent -5. The on-chain program throws error 6039 "Exponent Mismatch"
  // when they differ. Patch the instruction bytes before returning so the exponent matches
  // the oracle's actual exponent.
  const PLACE_TRIGGER_DISC = Buffer.from('209c32bce89f70ec', 'hex');
  const txBytes = Buffer.from(tx, 'base64');
  const vtx = VersionedTransaction.deserialize(txBytes);
  let patched = false;
  for (const ix of vtx.message.compiledInstructions) {
    const data = Buffer.from(ix.data);
    // Layout: discriminator(8) + price_i64(8) + price_exp_i32(4) + size_i64(8) + is_stop_loss(1)
    if (data.length >= 21 && data.subarray(0, 8).equals(PLACE_TRIGGER_DISC)) {
      const currentExp = data.readInt32LE(16);
      if (currentExp !== oracleExponent) {
        // Rewrite price to match oracle exponent, then fix exponent field
        const currentPriceRaw = data.readBigInt64LE(8);
        const expDiff = oracleExponent - currentExp; // e.g. -5 - (-6) = +1
        const scale = BigInt(Math.round(Math.pow(10, Math.abs(expDiff))));
        const newPriceRaw = expDiff > 0
          ? currentPriceRaw / scale
          : currentPriceRaw * scale;
        data.writeBigInt64LE(newPriceRaw, 8);
        data.writeInt32LE(oracleExponent, 16);
        ix.data.set(data);
        patched = true;
      }
      break;
    }
  }

  if (patched) {
    // Re-serialize with patched data (signatures are empty — user signs in signAndSend)
    const patchedBytes = vtx.serialize();
    return { transaction: Buffer.from(patchedBytes).toString('base64') };
  }
  return { transaction: tx };
}

export async function buildCancelTriggerOrder(
  owner: string,
  positionPubkey: string,
  isStopLoss: boolean,
  marketSymbol: string,
  side: PerpSide,
): Promise<{ transaction: string }> {
  const resp = await apiFetch<RawTxResponse>('/api/perps/cancel-trigger', {
    method: 'POST',
    body: JSON.stringify({
      owner,
      orderIndex: positionPubkey,
      marketSymbol,
      side: side === 'long' ? 'LONG' : 'SHORT',
      orderId: isStopLoss ? 0 : 1,
      isStopLoss,
    }),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned');
  return { transaction: tx };
}
