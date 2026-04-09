import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '../config/constants';

interface TokenSupplyResult {
  amount: string;
  decimals: number;
  uiAmount: number;
}

async function fetchTokenSupply(mint: string): Promise<TokenSupplyResult | null> {
  const res = await fetch(`${API_BASE}/api/price/supply?mint=${mint}`);
  if (!res.ok) return null;
  return await res.json() as TokenSupplyResult | null;
}

export function useTokenSupply(mint: string | null) {
  return useQuery({
    queryKey: ['token-supply', mint],
    queryFn: () => (mint ? fetchTokenSupply(mint) : null),
    enabled: !!mint,
    staleTime: 60_000,
    retry: false,
  });
}
