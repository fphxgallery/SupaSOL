import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export interface PricePoint {
  time: number;  // unix seconds
  value: number;
}

export type ChartInterval = '1H' | '4H' | '1D' | '1W' | '1M';

// Solana mint → CoinGecko coin ID (mirrors the backend mapping)
const COINGECKO_IDS: Record<string, string> = {
  So11111111111111111111111111111111111111112:    'solana',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'usd-coin',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'tether',
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN:  'jupiter-exchange-solana',
  // Perps markets
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': 'bitcoin',
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': 'ethereum',
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 'jito-network',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'bonk',
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': 'dogwifcoin',
  'HZ1JovNiVvGqSmqAwards3DHW9u29RatKHHyEMqVFxBdg': 'pyth-network',
  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL':  'jito-governance',
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'raydium',
};

const INTERVAL_DAYS: Record<ChartInterval, number> = {
  '1H': 1, '4H': 1, '1D': 1, '1W': 7, '1M': 30,
};

const INTERVAL_SECONDS: Record<ChartInterval, number> = {
  '1H': 3600,
  '4H': 4 * 3600,
  '1D': 86400,
  '1W': 7 * 86400,
  '1M': 30 * 86400,
};

// Direct CoinGecko fetch (browser → CoinGecko, no API key, CORS-friendly)
async function fetchFromCoinGecko(mint: string, interval: ChartInterval): Promise<PricePoint[]> {
  const coinId = COINGECKO_IDS[mint];
  if (!coinId) throw new Error(`No CoinGecko ID for mint: ${mint}`);

  const days = INTERVAL_DAYS[interval];
  const url  = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart` +
               `?vs_currency=usd&days=${days}&precision=6`;

  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`CoinGecko ${resp.status}`);

  const json = await resp.json() as { prices: [number, number][] };
  const cutoff = Date.now() / 1000 - INTERVAL_SECONDS[interval];

  return json.prices
    .map(([ts, price]) => ({ time: Math.floor(ts / 1000), value: price }))
    .filter((p) => p.time >= cutoff);
}

// Backend proxy fetch (preferred — cached, no rate-limit exposure)
async function fetchFromBackend(mint: string, interval: ChartInterval): Promise<PricePoint[]> {
  const result = await apiFetch<{ data: PricePoint[] }>(
    `/api/price/history?mint=${mint}&interval=${interval}`
  );
  return result.data;
}

export function usePriceHistory(mint: string | null, interval: ChartInterval) {
  return useQuery({
    queryKey: ['price-history', mint, interval],
    queryFn: async (): Promise<PricePoint[]> => {
      if (!mint) return [];
      try {
        // Try backend proxy first (preferred path in production)
        return await fetchFromBackend(mint, interval);
      } catch {
        // Fallback: hit CoinGecko directly from the browser
        return await fetchFromCoinGecko(mint, interval);
      }
    },
    enabled: !!mint && !!COINGECKO_IDS[mint],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });
}
