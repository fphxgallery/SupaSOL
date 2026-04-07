import { useQuery } from '@tanstack/react-query';
import { fetchPrices, type TokenPrice } from '../api/price';
import { MINTS } from '../config/constants';

const DEFAULT_MINTS = [MINTS.SOL, MINTS.USDC, MINTS.USDT, MINTS.JUP];

export function usePrice(mints: string[] = DEFAULT_MINTS) {
  return useQuery({
    queryKey: ['prices', mints.join(',')],
    queryFn: () => fetchPrices(mints),
    refetchInterval: 10_000, // poll every 10s per Jupiter skill guidance
    staleTime: 5_000,
    select: (data) => {
      // Filter out tokens with unreliable pricing (null price)
      const filtered: Record<string, TokenPrice> = {};
      for (const [mint, info] of Object.entries(data)) {
        if (info.price !== null) filtered[mint] = info;
      }
      return filtered;
    },
  });
}

export function useSolPrice(): number | null {
  const { data } = usePrice([MINTS.SOL]);
  const info = data?.[MINTS.SOL];
  if (!info?.price) return null;
  return parseFloat(info.price);
}
