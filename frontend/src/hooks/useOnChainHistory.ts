import { useQuery } from '@tanstack/react-query';
import { Connection, PublicKey } from '@solana/web3.js';
import { useClusterStore } from '../store/clusterStore';

export interface OnChainTx {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: object | null;
  memo: string | null;
}

export function useOnChainHistory(address: string | null) {
  const rpcUrl  = useClusterStore((s) => s.rpcUrl);
  const cluster = useClusterStore((s) => s.cluster);

  return useQuery({
    queryKey: ['on-chain-history', address, cluster],
    queryFn: async (): Promise<OnChainTx[]> => {
      const connection = new Connection(rpcUrl, 'confirmed');
      const pubkey = new PublicKey(address!);
      const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 50 });
      return sigs.map((s) => ({
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime ?? null,
        err: s.err as object | null,
        memo: s.memo ?? null,
      }));
    },
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 2,
  });
}
