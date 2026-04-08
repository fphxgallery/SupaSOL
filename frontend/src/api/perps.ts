import { apiFetch } from './client';

// ─── Raw Flash Trade API shapes ───────────────────────────────────────────────

interface RawMarket {
  marketPubkey?: string;
  pubkey?: string;
  name?: string;
  symbol?: string;
  pair?: string;
  assetMint?: string;
  collateralMint?: string;
  collateralDecimals?: number;
  maxLeverage?: number;
  price?: string | number;
  currentPrice?: string | number;
}

interface RawPriceEntry {
  name?: string;
  symbol?: string;
  price?: number;
  price_ui?: number;
  expo?: number;
  exponent?: number;
  marketPubkey?: string;
  pubkey?: string;
}

interface RawPosition {
  positionPubkey?: string;
  marketPubkey?: string;
  ownerPubkey?: string;
  side?: string;
  collateral?: string | number;
  size?: string | number;
  entryPrice?: string | number;
  liquidationPrice?: string | number;
  leverage?: string | number;
  unrealizedPnl?: string | number;
  unrealizedPnlPercent?: string | number;
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
  pubkey: string;
  symbol: string;           // e.g. "SOL"
  name: string;             // e.g. "SOL/USD"
  collateralMint: string;
  collateralDecimals: number;
  maxLeverage: number;
  currentPrice: number;     // UI price
}

export type PerpSide = 'long' | 'short';

export interface PerpsPosition {
  positionPubkey: string;
  marketPubkey: string;
  symbol: string;
  side: PerpSide;
  collateral: number;         // UI amount (USD)
  size: number;               // UI amount (USD)
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
  owner?: string;               // omit for preview mode
  marketPubkey: string;
  side: PerpSide;
  collateralUi: number;         // UI amount (e.g. 100 for $100 USDC)
  collateralDecimals: number;
  leverage: number;
  markPriceUi: number;          // current mark price for slippage calc
  slippagePct?: number;         // default 0.5%
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a UI price to Flash Trade's { price, exponent } oracle format. */
function toPriceWithSlippage(
  priceUi: number,
  side: PerpSide,
  slippagePct = 0.005,
): { price: number; exponent: number } {
  const factor = side === 'long' ? 1 + slippagePct : 1 - slippagePct;
  const adjusted = priceUi * factor;
  // 9-decimal precision representation
  return { price: Math.round(adjusted * 1_000_000_000), exponent: -9 };
}

function toNum(v: string | number | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeMarket(raw: RawMarket): PerpsMarket | null {
  const pubkey = raw.marketPubkey ?? raw.pubkey ?? '';
  if (!pubkey) return null;
  const symbol =
    raw.symbol ??
    (raw.name ?? raw.pair ?? '').split('/')[0] ??
    pubkey.slice(0, 4);
  const currentPrice = toNum(raw.currentPrice ?? raw.price);
  return {
    pubkey,
    symbol,
    name: raw.name ?? raw.pair ?? `${symbol}/USD`,
    collateralMint: raw.collateralMint ?? '',
    collateralDecimals: raw.collateralDecimals ?? 6,
    maxLeverage: raw.maxLeverage ?? 100,
    currentPrice,
  };
}

function normalizePosition(raw: RawPosition, marketsByPubkey: Map<string, PerpsMarket>): PerpsPosition | null {
  const positionPubkey = raw.positionPubkey ?? '';
  const marketPubkey = raw.marketPubkey ?? '';
  if (!positionPubkey) return null;
  const market = marketsByPubkey.get(marketPubkey);
  const symbol = market?.symbol ?? marketPubkey.slice(0, 4);
  const side: PerpSide = raw.side === 'short' ? 'short' : 'long';
  return {
    positionPubkey,
    marketPubkey,
    symbol,
    side,
    collateral: toNum(raw.collateral),
    size: toNum(raw.size),
    entryPrice: toNum(raw.entryPrice),
    liquidationPrice: toNum(raw.liquidationPrice),
    leverage: toNum(raw.leverage),
    unrealizedPnl: toNum(raw.unrealizedPnl),
    unrealizedPnlPercent: toNum(raw.unrealizedPnlPercent),
    stopLossPrice: raw.stopLossPrice != null ? toNum(raw.stopLossPrice) : undefined,
    takeProfitPrice: raw.takeProfitPrice != null ? toNum(raw.takeProfitPrice) : undefined,
  };
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function fetchPerpsMarkets(): Promise<PerpsMarket[]> {
  const resp = await apiFetch<unknown>('/api/perps/markets');
  // Handle both array and { markets: [...] } envelope
  const arr: RawMarket[] = Array.isArray(resp)
    ? (resp as RawMarket[])
    : Array.isArray((resp as { markets?: RawMarket[] }).markets)
    ? (resp as { markets: RawMarket[] }).markets
    : [];
  return arr.map(normalizeMarket).filter((m): m is PerpsMarket => m !== null);
}

export async function fetchPerpsPrices(): Promise<Record<string, number>> {
  const resp = await apiFetch<unknown>('/api/perps/prices');
  const result: Record<string, number> = {};
  // Handle array of price entries
  if (Array.isArray(resp)) {
    for (const entry of resp as RawPriceEntry[]) {
      const key = entry.marketPubkey ?? entry.pubkey ?? entry.name ?? entry.symbol ?? '';
      const price = entry.price_ui ?? entry.price ?? 0;
      if (key && price) result[key] = typeof price === 'number' ? price : parseFloat(String(price));
    }
  } else if (resp && typeof resp === 'object') {
    // Handle { SOL: { price_ui: 150 }, ... } or { pubkey: price, ... }
    for (const [k, v] of Object.entries(resp as Record<string, unknown>)) {
      if (typeof v === 'number') {
        result[k] = v;
      } else if (v && typeof v === 'object') {
        const entry = v as RawPriceEntry;
        result[k] = entry.price_ui ?? entry.price ?? 0;
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
    .map((p) => normalizePosition(p, marketsByPubkey))
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
  if (!params.owner) throw new Error('wallet required to build transaction');
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
  if (!tx) throw new Error('No transaction returned from Flash Trade');
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
  if (!tx) throw new Error('No transaction returned from Flash Trade');
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
  if (!tx) throw new Error('No transaction returned from Flash Trade');
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
    body: JSON.stringify({
      owner,
      positionIndex: positionPubkey,
      triggerPrice,
      isStopLoss,
    }),
  });
  if (resp.err) throw new Error(resp.err);
  const tx = resp.transactionBase64 ?? resp.transaction ?? '';
  if (!tx) throw new Error('No transaction returned from Flash Trade');
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
  if (!tx) throw new Error('No transaction returned from Flash Trade');
  return { transaction: tx };
}
