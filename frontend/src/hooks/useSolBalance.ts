import { useQuery } from '@tanstack/react-query';
import { Connection, PublicKey } from '@solana/web3.js';
import { useClusterStore } from '../store/clusterStore';

export function useSolBalance(publicKey: string | null) {
  const rpcUrl = useClusterStore((s) => s.rpcUrl);

  return useQuery({
    queryKey: ['sol-balance', publicKey, rpcUrl],
    queryFn: async () => {
      if (!publicKey) return null;
      const connection = new Connection(rpcUrl, 'confirmed');
      return connection.getBalance(new PublicKey(publicKey));
    },
    enabled: !!publicKey,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 2,
  });
}
