import { useQuery } from '@tanstack/react-query';
import type { ChartInterval } from './usePriceHistory';
import { API_BASE } from '../config/constants';

export interface OHLCVPoint {
  time: number;   // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

// ─── Backend proxy (DexScreener via server — no CORS issues) ─────────────────

async function fetchFromBackend(mint: string, interval: ChartInterval): Promise<OHLCVPoint[]> {
  const res = await fetch(`${API_BASE}/api/ohlcv?mint=${mint}&interval=${interval}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OHLCV proxy ${res.status}`);
  const data = await res.json() as OHLCVPoint[];
  if (!Array.isArray(data) || data.length === 0) throw new Error('No data');
  return data;
}

// ─── CoinGecko fallback (known mints only) ────────────────────────────────────

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
  symbol: string | null,
  interval: ChartInterval,
  mint?: string | null,
) {
  return useQuery({
    queryKey: ['ohlcv', mint, interval],
    queryFn: async (): Promise<OHLCVPoint[]> => {
      if (!mint) return [];
      // Backend proxy primary — DexScreener server-side, covers any Solana token
      try {
        return await fetchFromBackend(mint, interval);
      } catch { /* fall through */ }
      // CoinGecko fallback — for major tokens if backend is unavailable
      if (COINGECKO_IDS[mint]) {
        return fetchFromCoinGecko(mint, interval);
      }
      return [];
    },
    enabled: !!mint,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });
}
