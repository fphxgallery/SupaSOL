import { useQuery } from '@tanstack/react-query';
import type { ChartInterval } from './usePriceHistory';

export interface OHLCVPoint {
  time: number;   // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

// ─── Pyth Network symbol map ──────────────────────────────────────────────────
// Pyth benchmarks API: https://benchmarks.pyth.network/v1/shims/tradingview/history
// Covers all Flash Trade markets — crypto, equities, forex, metals, commodities.
const PYTH_SYMBOLS: Record<string, string> = {
  // Crypto
  SOL:      'Crypto.SOL/USD',
  BTC:      'Crypto.BTC/USD',
  ETH:      'Crypto.ETH/USD',
  JitoSOL:  'Crypto.JITOSOL/USD',
  JUP:      'Crypto.JUP/USD',
  BONK:     'Crypto.BONK/USD',
  WIF:      'Crypto.WIF/USD',
  PYTH:     'Crypto.PYTH/USD',
  JTO:      'Crypto.JTO/USD',
  RAY:      'Crypto.RAY/USD',
  ZEC:      'Crypto.ZEC/USD',
  BNB:      'Crypto.BNB/USD',
  PENGU:    'Crypto.PENGU/USD',
  FARTCOIN: 'Crypto.FARTCOIN/USD',
  HYPE:     'Crypto.HYPE/USD',
  KMNO:     'Crypto.KMNO/USD',
  // Equities
  SPY:  'Equity.US.SPY/USD',
  NVDA: 'Equity.US.NVDA/USD',
  TSLA: 'Equity.US.TSLA/USD',
  AAPL: 'Equity.US.AAPL/USD',
  AMD:  'Equity.US.AMD/USD',
  AMZN: 'Equity.US.AMZN/USD',
  // Metals
  XAU:  'Metal.XAU/USD',
  XAUt: 'Metal.XAU/USD',
  XAG:  'Metal.XAG/USD',
  // Forex
  EUR:    'FX.EUR/USD',
  GBP:    'FX.GBP/USD',
  USDJPY: 'FX.USD/JPY',
  USDCNH: 'FX.USD/CNH',
  // Energy
  CRUDEOIL: 'Energy.WTI/USD',
  NATGAS:   'Energy.NATGAS/USD',
  // ORE, MET, PUMP — no Pyth feed; will return empty
};

// Pyth resolution strings and lookback windows (seconds)
// Using generous lookbacks to get 200+ bars for MA200 support.
const PYTH_RESOLUTION: Record<ChartInterval, string> = {
  '1H':  '60',   // 60-min candles
  '4H':  '240',  // 4H candles
  '1D':  'D',    // daily
  '1W':  'W',    // weekly
  '1M':  'M',    // monthly
};

const PYTH_LOOKBACK: Record<ChartInterval, number> = {
  '1H':  86400 * 14,        // 14 days of hourly bars → 336 bars
  '4H':  86400 * 60,        // 60 days of 4H bars    → 360 bars
  '1D':  86400 * 365,       // 1 year of daily bars  → 365 bars
  '1W':  86400 * 365 * 5,   // 5 years of weekly     → 260 bars
  '1M':  86400 * 365 * 10,  // 10 years of monthly   → 120 bars
};

// TradingView UDF response
interface UDFResponse {
  s: string;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}

async function fetchFromPyth(symbol: string, interval: ChartInterval): Promise<OHLCVPoint[]> {
  const pythSymbol = PYTH_SYMBOLS[symbol];
  if (!pythSymbol) throw new Error(`No Pyth symbol for: ${symbol}`);

  const to   = Math.floor(Date.now() / 1000);
  const from = to - PYTH_LOOKBACK[interval];
  const resolution = PYTH_RESOLUTION[interval];
  const url = `https://benchmarks.pyth.network/v1/shims/tradingview/history` +
    `?symbol=${encodeURIComponent(pythSymbol)}&resolution=${resolution}&from=${from}&to=${to}`;

  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Pyth ${resp.status}`);

  const json = await resp.json() as UDFResponse;
  if (json.s !== 'ok' || !json.t?.length) throw new Error('Pyth: no data');

  // Deduplicate by timestamp and sort ascending
  const map = new Map<number, OHLCVPoint>();
  for (let i = 0; i < json.t.length; i++) {
    map.set(json.t[i], {
      time:  json.t[i],
      open:  json.o[i],
      high:  json.h[i],
      low:   json.l[i],
      close: json.c[i],
    });
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

// ─── CoinGecko fallback (crypto-only mints) ──────────────────────────────────
const COINGECKO_IDS: Record<string, string> = {
  So11111111111111111111111111111111111111112:    'solana',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'usd-coin',
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': 'bitcoin',
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': 'ethereum',
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN:  'jupiter-exchange-solana',
};

const CG_DAYS: Record<ChartInterval, number> = {
  '1H': 2, '4H': 14, '1D': 30, '1W': 365, '1M': 730,
};

async function fetchFromCoinGecko(mint: string, interval: ChartInterval): Promise<OHLCVPoint[]> {
  const coinId = COINGECKO_IDS[mint];
  if (!coinId) throw new Error(`No CoinGecko ID for: ${mint}`);
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${CG_DAYS[interval]}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`CoinGecko ${resp.status}`);
  const json = await resp.json() as [number, number, number, number, number][];
  const map = new Map<number, OHLCVPoint>();
  for (const [tMs, o, h, l, c] of json) {
    const t = Math.floor(tMs / 1000);
    map.set(t, { time: t, open: o, high: h, low: l, close: c });
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOHLCV(
  /** Symbol string (e.g. "SOL", "NVDA") — used for Pyth lookup */
  symbol: string | null,
  interval: ChartInterval,
  /** Mint address fallback for CoinGecko (optional) */
  mint?: string | null,
) {
  return useQuery({
    queryKey: ['ohlcv', symbol, interval],
    queryFn: async (): Promise<OHLCVPoint[]> => {
      if (!symbol) return [];
      // Try Pyth first (all markets)
      if (PYTH_SYMBOLS[symbol]) {
        try {
          return await fetchFromPyth(symbol, interval);
        } catch { /* fall through to CoinGecko */ }
      }
      // Fall back to CoinGecko for crypto mints
      if (mint && COINGECKO_IDS[mint]) {
        return fetchFromCoinGecko(mint, interval);
      }
      return [];
    },
    enabled: !!symbol,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });
}

export { PYTH_SYMBOLS };
