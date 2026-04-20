import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getVault } from '../api/vault';

export function useVaultStatus() {
  return useQuery({
    queryKey: ['vault-status'],
    queryFn: getVault,
    staleTime: Infinity,
    retry: false,
  });
}

export function useInvalidateVault() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['vault-status'] });
}
