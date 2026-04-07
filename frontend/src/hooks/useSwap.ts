import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getSwapOrder, executeSwap, type SwapOrderResponse } from '../api/swap';
import { useSignAndSend } from './useSignAndSend';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { useTxStore } from '../store/txStore';
import { useClusterStore } from '../store/clusterStore';
import { withRetry } from '../api/client';

interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  userPublicKey: string;
}

export function useSwapQuote(params: Partial<SwapParams>) {
  const slippageBps = useSettingsStore((s) => s.slippageBps);

  return useQuery({
    queryKey: ['swap-quote', params.inputMint, params.outputMint, params.amount, slippageBps],
    queryFn: () => getSwapOrder({
      inputMint: params.inputMint!,
      outputMint: params.outputMint!,
      amount: params.amount!,
      userPublicKey: params.userPublicKey!,
      slippageBps,
    }),
    enabled: !!(params.inputMint && params.outputMint && params.amount && params.amount > 0 && params.userPublicKey),
    staleTime: 10_000, // quotes go stale in ~10s
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function useSwapExecute() {
  const { signTransaction, hasWallet } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);
  const addTx = useTxStore((s) => s.addTx);
  const cluster = useClusterStore((s) => s.cluster);
  const [lastOrder, setLastOrder] = useState<SwapOrderResponse | null>(null);

  const mutation = useMutation({
    mutationFn: async (order: SwapOrderResponse) => {
      setLastOrder(order);

      addToast({ type: 'info', message: 'Submitting swap...' });

      // Sign the transaction client-side
      const signedTx = await signTransaction(order.transaction);

      // Execute via Jupiter — retryable error codes: -1, -1000, -1001, -1004, -2000, -2001, -2003, -2004
      const result = await withRetry(() => executeSwap(signedTx, order.requestId));

      if (result.status === 'Failed') {
        const retryable = [-1, -1000, -1001, -1004, -2000, -2001, -2003, -2004].includes(result.code ?? 0);
        throw Object.assign(new Error(result.error ?? 'Swap failed'), { code: result.code, retryable });
      }

      return result;
    },
    onSuccess: (result) => {
      addToast({
        type: 'success',
        message: 'Swap confirmed!',
        txSig: result.signature,
      });
      if (result.signature) {
        addTx({ sig: result.signature, status: 'confirmed', description: 'Swap', cluster });
      }
    },
    onError: (err: Error & { code?: number }) => {
      addToast({ type: 'error', message: err.message || 'Swap failed' });
    },
  });

  return { ...mutation, lastOrder, hasWallet };
}
