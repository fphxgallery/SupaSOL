import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

interface JupTokenResult {
  id?: string;
  address?: string;
  symbol?: string;
  name?: string;
  icon?: string;
  logoURI?: string;
}

export interface TokenMeta {
  symbol: string;
  name: string;
  logoURI?: string;
}

/**
 * Batch-fetches token metadata (symbol, name, logoURI) for a list of mint addresses.
 * Returns a map of mint → TokenMeta. Mints not found in the API are omitted.
 */
export function useTokenMetadata(mints: string[]): Record<string, TokenMeta> {
  const key = [...mints].sort().join(',');

  const { data } = useQuery({
    queryKey: ['token-metadata', key],
    queryFn: async (): Promise<Record<string, TokenMeta>> => {
      if (mints.length === 0) return {};
      // Jupiter tokens v2 search accepts comma-separated mint addresses (max 100)
      const query = mints.slice(0, 100).join(',');
      const resp = await apiFetch<JupTokenResult[]>(
        `/api/tokens/search?query=${encodeURIComponent(query)}`
      );
      const map: Record<string, TokenMeta> = {};
      if (Array.isArray(resp)) {
        for (const t of resp) {
          const addr = t.id ?? t.address ?? '';
          if (!addr) continue;
          map[addr] = {
            symbol: t.symbol ?? addr.slice(0, 4) + '…',
            name:   t.name   ?? addr.slice(0, 4) + '…',
            logoURI: t.icon ?? t.logoURI,
          };
        }
      }
      return map;
    },
    enabled: mints.length > 0,
    staleTime: 5 * 60_000, // metadata rarely changes — cache for 5 minutes
    retry: 1,
  });

  return data ?? {};
}
