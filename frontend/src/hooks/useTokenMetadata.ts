import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

interface JupTokenResult {
  id?: string;
  address?: string;
  icon?: string;
  logoURI?: string;
}

/**
 * Batch-fetches token metadata (primarily logoURI/icon) for a list of mint addresses.
 * Returns a map of mint → logoURI. Mints not found in the API are omitted.
 */
export function useTokenMetadata(mints: string[]): Record<string, string> {
  const key = [...mints].sort().join(',');

  const { data } = useQuery({
    queryKey: ['token-metadata', key],
    queryFn: async (): Promise<Record<string, string>> => {
      if (mints.length === 0) return {};
      // Jupiter tokens v2 search accepts comma-separated mint addresses (max 100)
      const query = mints.slice(0, 100).join(',');
      const resp = await apiFetch<JupTokenResult[]>(
        `/api/tokens/search?query=${encodeURIComponent(query)}`
      );
      const map: Record<string, string> = {};
      if (Array.isArray(resp)) {
        for (const t of resp) {
          const addr = t.id ?? t.address ?? '';
          const logo = t.icon ?? t.logoURI;
          if (addr && logo) map[addr] = logo;
        }
      }
      return map;
    },
    enabled: mints.length > 0,
    staleTime: 5 * 60_000, // logos rarely change — cache for 5 minutes
    retry: 1,
  });

  return data ?? {};
}
