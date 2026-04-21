import { config } from '../config';

const JUP_BASE = 'https://api.jup.ag';

const jupHeaders = () => ({
  'Content-Type': 'application/json',
  'x-api-key': config.jupiterApiKey,
});

export interface SwapOrderParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  userPublicKey: string;
  slippageBps?: number;
  swapMode?: 'ExactIn' | 'ExactOut';
}

export interface SwapOrderResponse {
  transaction: string;
  requestId: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
}

export interface SwapExecuteResponse {
  status: 'Success' | 'Failed';
  signature?: string;
  error?: string;
  outputAmountResult?: string;
}

export interface TrendingToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  usdPrice?: number;
  mcap?: number;
  organicScore?: number;
  audit?: { isMintable?: boolean; isFreezable?: boolean; isSus?: boolean };
  stats: Partial<Record<'5m' | '1h' | '6h' | '24h', {
    priceChange?: number;
    numOrganicBuyers?: number;
  }>>;
}

export interface TokenPrice {
  usdPrice: number;
}

export async function getSwapOrder(params: SwapOrderParams): Promise<SwapOrderResponse> {
  const qs = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount.toString(),
    taker: params.userPublicKey,
    ...(params.slippageBps !== undefined && { slippageBps: params.slippageBps.toString() }),
    ...(params.swapMode && { swapMode: params.swapMode }),
  });
  const resp = await fetch(`${JUP_BASE}/swap/v2/order?${qs}`, { headers: jupHeaders() });
  if (!resp.ok) throw new Error(`Swap order ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<SwapOrderResponse>;
}

export async function executeSwap(signedTransaction: string, requestId: string): Promise<SwapExecuteResponse> {
  const resp = await fetch(`${JUP_BASE}/swap/v2/execute`, {
    method: 'POST',
    headers: jupHeaders(),
    body: JSON.stringify({ signedTransaction, requestId }),
  });
  if (!resp.ok) throw new Error(`Swap execute ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<SwapExecuteResponse>;
}

export async function fetchTrendingTokens(interval: string): Promise<TrendingToken[]> {
  const resp = await fetch(`${JUP_BASE}/tokens/v2/toptrending/${interval}`, { headers: jupHeaders() });
  if (!resp.ok) return [];
  const raw = await resp.json() as Array<{
    id: string; name: string; symbol: string; decimals: number;
    usdPrice?: number; mcap?: number; organicScore?: number;
    audit?: TrendingToken['audit'];
    stats5m?: { priceChange?: number; numOrganicBuyers?: number };
    stats1h?: { priceChange?: number; numOrganicBuyers?: number };
    stats6h?: { priceChange?: number; numOrganicBuyers?: number };
    stats24h?: { priceChange?: number; numOrganicBuyers?: number };
  }>;
  return raw.map((t) => ({
    address: t.id,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    usdPrice: t.usdPrice,
    mcap: t.mcap,
    organicScore: t.organicScore,
    audit: t.audit,
    stats: {
      '5m':  t.stats5m  ? { priceChange: t.stats5m.priceChange,  numOrganicBuyers: t.stats5m.numOrganicBuyers  } : undefined,
      '1h':  t.stats1h  ? { priceChange: t.stats1h.priceChange,  numOrganicBuyers: t.stats1h.numOrganicBuyers  } : undefined,
      '6h':  t.stats6h  ? { priceChange: t.stats6h.priceChange,  numOrganicBuyers: t.stats6h.numOrganicBuyers  } : undefined,
      '24h': t.stats24h ? { priceChange: t.stats24h.priceChange, numOrganicBuyers: t.stats24h.numOrganicBuyers } : undefined,
    },
  }));
}

export async function fetchPrices(mints: string[]): Promise<Record<string, TokenPrice>> {
  if (mints.length === 0) return {};
  const resp = await fetch(`${JUP_BASE}/price/v3?ids=${mints.slice(0, 50).join(',')}`, { headers: jupHeaders() });
  if (!resp.ok) return {};
  const raw = await resp.json() as Record<string, unknown>;

  const result: Record<string, TokenPrice> = {};

  if (raw && 'data' in raw && raw.data && typeof raw.data === 'object' && !('usdPrice' in (raw.data as object))) {
    for (const [mint, entry] of Object.entries(raw.data as Record<string, { price?: string }>)) {
      const price = entry?.price ? parseFloat(entry.price) : NaN;
      if (!isNaN(price)) result[mint] = { usdPrice: price };
    }
  } else {
    for (const [mint, entry] of Object.entries(raw as Record<string, { usdPrice?: number }>)) {
      const price = entry?.usdPrice;
      if (typeof price === 'number' && !isNaN(price)) result[mint] = { usdPrice: price };
    }
  }

  return result;
}
