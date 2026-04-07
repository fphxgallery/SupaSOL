import { useQuery } from '@tanstack/react-query';
import { fetchPortfolio } from '../api/portfolio';

export function usePortfolio(address: string | null) {
  return useQuery({
    queryKey: ['portfolio', address],
    queryFn: () => fetchPortfolio(address!),
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 2,
  });
}
