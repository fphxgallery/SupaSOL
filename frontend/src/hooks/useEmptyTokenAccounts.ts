import { useQuery } from '@tanstack/react-query';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { useClusterStore } from '../store/clusterStore';

export interface EmptyTokenAccount {
  pubkey: PublicKey;
  mint: string;
  programId: PublicKey;
}

export function useEmptyTokenAccounts(publicKey: string | null) {
  const rpcUrl = useClusterStore((s) => s.rpcUrl);

  return useQuery({
    queryKey: ['empty-token-accounts', publicKey, rpcUrl],
    queryFn: async (): Promise<EmptyTokenAccount[]> => {
      if (!publicKey) return [];
      const connection = new Connection(rpcUrl, 'confirmed');
      const owner = new PublicKey(publicKey);

      const [splAccounts, t22Accounts] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
      ]);

      const results: EmptyTokenAccount[] = [];

      for (const { pubkey, account } of splAccounts.value) {
        const amount = Number(account.data.parsed.info.tokenAmount.amount);
        if (amount === 0) {
          results.push({ pubkey, mint: account.data.parsed.info.mint, programId: TOKEN_PROGRAM_ID });
        }
      }
      for (const { pubkey, account } of t22Accounts.value) {
        const amount = Number(account.data.parsed.info.tokenAmount.amount);
        if (amount === 0) {
          results.push({ pubkey, mint: account.data.parsed.info.mint, programId: TOKEN_2022_PROGRAM_ID });
        }
      }

      return results;
    },
    enabled: !!publicKey,
    staleTime: 30_000,
    retry: 2,
  });
}
