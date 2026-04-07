import { useQuery } from '@tanstack/react-query';
import { fetchPrices, type TokenPrice } from '../api/price';
import { MINTS } from '../config/constants';

const DEFAULT_MINTS = [MINTS.SOL, MINTS.USDC, MINTS.USDT, MINTS.JUP];

export function usePrice(mints: string[] = DEFAULT_MINTS) {
  return useQuery({
    queryKey: ['prices', mints.join(',')],
    queryFn: () => fetchPrices(mints),
    refetchInterval: 10_000,
    staleTime: 5_000,
    select: (data) => {
      // Keep only tokens with a valid usdPrice
      const filtered: Record<string, TokenPrice> = {};
      for (const [mint, info] of Object.entries(data)) {
        if (info?.usdPrice) filtered[mint] = info;
      }
      return filtered;
    },
  });
}

export function useSolPrice(): number | null {
  const { data } = usePrice([MINTS.SOL]);
  return data?.[MINTS.SOL]?.usdPrice ?? null;
}
