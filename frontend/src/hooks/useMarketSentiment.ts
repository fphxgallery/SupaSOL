import { useQuery } from '@tanstack/react-query';
import { getMarketSentiment } from '../api/bot';

export function useMarketSentiment(enabled: boolean) {
  return useQuery({
    queryKey: ['bot-market-sentiment'],
    queryFn: getMarketSentiment,
    refetchInterval: 30_000,
    retry: false,
    staleTime: 0,
    enabled,
  });
}
