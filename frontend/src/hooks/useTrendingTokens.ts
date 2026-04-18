import { useQuery } from '@tanstack/react-query';
import { fetchTrendingTokens } from '../api/tokens';

export type TrendingInterval = '5m' | '1h' | '6h' | '24h';

export function useTrendingTokens(interval: TrendingInterval = '24h') {
  return useQuery({
    queryKey: ['trending', interval],
    queryFn: () => fetchTrendingTokens(interval),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  });
}
