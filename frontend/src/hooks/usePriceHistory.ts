import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '../config/constants';

export interface PricePoint {
  time: number;  // unix seconds
  value: number;
}

export type ChartInterval = '1H' | '4H' | '1D' | '1W' | '1M';

// How many seconds back each interval label represents
const INTERVAL_WINDOW: Record<ChartInterval, number> = {
  '1H':  1 * 3600,
  '4H':  4 * 3600,
  '1D':  24 * 3600,
  '1W':  7  * 24 * 3600,
  '1M':  30 * 24 * 3600,
};

async function fetchPriceHistory(mint: string, interval: ChartInterval): Promise<PricePoint[]> {
  const res = await fetch(`${API_BASE}/api/ohlcv?mint=${mint}&interval=${interval}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OHLCV ${res.status}`);
  const data = await res.json() as { time: number; close: number }[];
  if (!Array.isArray(data) || data.length === 0) throw new Error('No data');

  // Filter to only the interval's time window
  const cutoff = Math.floor(Date.now() / 1000) - INTERVAL_WINDOW[interval];
  const points = data
    .filter((p) => p.time >= cutoff)
    .map((p) => ({ time: p.time, value: p.close }));

  // If filtering removed everything, return all (token may have sparse data)
  return points.length > 0 ? points : data.map((p) => ({ time: p.time, value: p.close }));
}

export function usePriceHistory(mint: string | null, interval: ChartInterval) {
  return useQuery({
    queryKey: ['price-history', mint, interval],
    queryFn: (): Promise<PricePoint[]> => {
      if (!mint) return Promise.resolve([]);
      return fetchPriceHistory(mint, interval);
    },
    enabled: !!mint,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });
}
