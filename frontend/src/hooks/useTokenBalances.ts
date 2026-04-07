import { useQuery } from '@tanstack/react-query';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useClusterStore } from '../store/clusterStore';

export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  uiAmount: number | null;
  symbol?: string;
}

export function useTokenBalances(publicKey: string | null) {
  const rpcUrl = useClusterStore((s) => s.rpcUrl);

  return useQuery({
    queryKey: ['token-balances', publicKey, rpcUrl],
    queryFn: async (): Promise<TokenBalance[]> => {
      if (!publicKey) return [];
      const connection = new Connection(rpcUrl, 'confirmed');
      const accounts = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(publicKey),
        { programId: TOKEN_PROGRAM_ID }
      );

      return accounts.value
        .map((a) => {
          const info = a.account.data.parsed.info;
          return {
            mint: info.mint as string,
            amount: Number(info.tokenAmount.amount),
            decimals: info.tokenAmount.decimals as number,
            uiAmount: info.tokenAmount.uiAmount as number | null,
          };
        })
        .filter((b) => b.uiAmount && b.uiAmount > 0);
    },
    enabled: !!publicKey,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
