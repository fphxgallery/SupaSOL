import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Connection } from '@solana/web3.js';
import { useClusterStore } from '../store/clusterStore';
import {
  getUserPositions,
  fetchPairInfo,
  fetchPairs,
  buildClaimRewardsTxs,
  buildRemoveAllLiquidityTxs,
  type MeteoraPairInfo,
  type UserPosition,
} from '../api/dlmm';
import { useSignAndSend } from './useSignAndSend';
import { useUiStore } from '../store/uiStore';

// ---------------------------------------------------------------------------
// Read hooks
// ---------------------------------------------------------------------------

/** All user DLMM positions across all pools. */
export function useUserPositions(wallet: string | null) {
  const rpcUrl = useClusterStore((s) => s.rpcUrl);

  return useQuery<UserPosition[]>({
    queryKey: ['dlmm-positions', wallet, rpcUrl],
    queryFn: async () => {
      if (!wallet) return [];
      const connection = new Connection(rpcUrl, 'confirmed');
      return getUserPositions(connection, wallet);
    },
    enabled: !!wallet,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 2,
  });
}

/** Meteora REST API info for a single pool. */
export function usePoolInfo(poolAddress: string | null) {
  return useQuery<MeteoraPairInfo>({
    queryKey: ['dlmm-pool', poolAddress],
    queryFn: () => fetchPairInfo(poolAddress!),
    enabled: !!poolAddress,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** Paginated pool list from Meteora API. */
export function usePools(opts: {
  page?: number;
  limit?: number;
  search?: string;
  sortKey?: string;
  orderBy?: 'asc' | 'desc';
} = {}) {
  return useQuery({
    queryKey: ['dlmm-pools', opts],
    queryFn: () => fetchPairs(opts),
    staleTime: 2 * 60_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/** Claim all swap fees + LM rewards for a position's pool. */
export function useClaimRewards() {
  const queryClient = useQueryClient();
  const rpcUrl = useClusterStore((s) => s.rpcUrl);
  const { signAndSendAllLegacy, hasWallet } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: async ({
      poolAddress,
      ownerAddress,
    }: {
      poolAddress: string;
      ownerAddress: string;
    }) => {
      if (!hasWallet) throw new Error('No wallet connected');
      addToast({ type: 'info', message: 'Building claim transactions...' });

      const connection = new Connection(rpcUrl, 'confirmed');
      const txs = await buildClaimRewardsTxs(connection, poolAddress, ownerAddress);

      if (txs.length === 0) throw new Error('No rewards to claim');
      return signAndSendAllLegacy(txs, 'Claim Rewards');
    },
    onSuccess: (_sigs, { ownerAddress }) => {
      queryClient.invalidateQueries({ queryKey: ['dlmm-positions', ownerAddress] });
    },
    onError: (err: Error) => {
      addToast({ type: 'error', message: err.message ?? 'Claim failed' });
    },
  });
}

/** Remove all liquidity from a position and close it. */
export function useRemoveLiquidity() {
  const queryClient = useQueryClient();
  const rpcUrl = useClusterStore((s) => s.rpcUrl);
  const { signAndSendAllLegacy, hasWallet } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: async ({
      poolAddress,
      positionPubkey,
      ownerAddress,
    }: {
      poolAddress: string;
      positionPubkey: string;
      ownerAddress: string;
    }) => {
      if (!hasWallet) throw new Error('No wallet connected');
      addToast({ type: 'info', message: 'Building remove transactions...' });

      const connection = new Connection(rpcUrl, 'confirmed');
      const txs = await buildRemoveAllLiquidityTxs(
        connection,
        poolAddress,
        ownerAddress,
        positionPubkey
      );

      if (txs.length === 0) throw new Error('No liquidity to remove');
      return signAndSendAllLegacy(txs, 'Remove Liquidity');
    },
    onSuccess: (_sigs, { ownerAddress }) => {
      queryClient.invalidateQueries({ queryKey: ['dlmm-positions', ownerAddress] });
    },
    onError: (err: Error) => {
      addToast({ type: 'error', message: err.message ?? 'Remove liquidity failed' });
    },
  });
}
