import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchLendTokens, fetchLendPositions, fetchLendEarnings, buildLendDeposit, buildLendWithdraw } from '../api/lend';
import { useSignAndSend } from './useSignAndSend';

export function useLendTokens() {
  return useQuery({
    queryKey: ['lend-tokens'],
    queryFn: fetchLendTokens,
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

export function useLendPositions(wallet: string | null) {
  return useQuery({
    queryKey: ['lend-positions', wallet],
    queryFn: () => fetchLendPositions(wallet!),
    enabled: !!wallet,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useLendEarnings(wallet: string | null) {
  return useQuery({
    queryKey: ['lend-earnings', wallet],
    queryFn: () => fetchLendEarnings(wallet!),
    enabled: !!wallet,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useLendDeposit() {
  const { signAndSend } = useSignAndSend();
  return useMutation({
    mutationFn: async (params: { wallet: string; mint: string; amount: number; symbol: string }) => {
      const { transaction } = await buildLendDeposit({ wallet: params.wallet, mint: params.mint, amount: params.amount });
      return signAndSend(transaction, `Deposit ${params.symbol}`);
    },
  });
}

export function useLendWithdraw() {
  const { signAndSend } = useSignAndSend();
  return useMutation({
    mutationFn: async (params: { wallet: string; mint: string; amount: number; symbol: string }) => {
      const { transaction } = await buildLendWithdraw({ wallet: params.wallet, mint: params.mint, amount: params.amount });
      return signAndSend(transaction, `Withdraw ${params.symbol}`);
    },
  });
}
