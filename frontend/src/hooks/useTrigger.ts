import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTriggerOrders, type TriggerOrder } from '../api/trigger';
import { apiFetch } from '../api/client';
import { useSignAndSend } from './useSignAndSend';
import { useUiStore } from '../store/uiStore';

export function useTriggerOrders(wallet: string | null) {
  return useQuery({
    queryKey: ['trigger-orders', wallet],
    queryFn: () => fetchTriggerOrders(wallet!),
    enabled: !!wallet,
    refetchInterval: 15_000,
    retry: false,
  });
}

export interface CreateTriggerParams {
  walletPubkey: string;
  inputMint: string;
  outputMint: string;
  inAmount: number;
  outAmount: number;
  triggerPrice: string;
  triggerCondition: 'above' | 'below';
  orderType?: 'single' | 'oco' | 'otoco';
}

export function useCreateTriggerOrder() {
  const { signAndSend, signTransaction } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateTriggerParams) => {
      // Step 1: Register vault (idempotent)
      await apiFetch(`/api/trigger/vault/register?walletPubkey=${params.walletPubkey}`);

      // Step 2: Craft deposit transaction
      const { transaction: depositTx, requestId: depositRequestId } = await apiFetch<{
        transaction: string; requestId: string;
      }>('/api/trigger/deposit/craft', {
        method: 'POST',
        body: JSON.stringify({
          walletPubkey: params.walletPubkey,
          inputMint: params.inputMint,
          amount: params.inAmount,
        }),
      });

      // Step 3: Sign deposit tx — but DON'T send it yet; it goes with the order
      const signedDepositTx = await signTransaction(depositTx);

      // Step 4: Create limit order
      const order = await apiFetch<TriggerOrder>('/api/trigger/orders/price', {
        method: 'POST',
        body: JSON.stringify({
          walletPubkey: params.walletPubkey,
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          inAmount: params.inAmount,
          outAmount: params.outAmount,
          triggerPrice: params.triggerPrice,
          triggerCondition: params.triggerCondition,
          orderType: params.orderType ?? 'single',
          depositRequestId,
          depositSignedTx: signedDepositTx,
        }),
      });

      return order;
    },
    onSuccess: (_, vars) => {
      addToast({ type: 'success', message: 'Limit order created!' });
      queryClient.invalidateQueries({ queryKey: ['trigger-orders', vars.walletPubkey] });
    },
    onError: (err: Error) => {
      addToast({ type: 'error', message: err.message || 'Failed to create order' });
    },
  });
}

export function useCancelTriggerOrder() {
  const { signTransaction } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, walletPubkey }: { orderId: string; walletPubkey: string }) => {
      // Step 1: Initiate cancel — get withdrawal tx + cancelRequestId
      const { transaction, requestId: cancelRequestId } = await apiFetch<{
        transaction: string; requestId: string;
      }>(`/api/trigger/orders/price/cancel/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({ walletPubkey }),
      });

      // Step 2: Sign withdrawal tx
      const signedTransaction = await signTransaction(transaction);

      // Step 3: Confirm cancel
      return apiFetch(`/api/trigger/orders/price/confirm-cancel/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({ walletPubkey, signedTransaction, cancelRequestId }),
      });
    },
    onSuccess: (_, vars) => {
      addToast({ type: 'success', message: 'Order cancelled' });
      queryClient.invalidateQueries({ queryKey: ['trigger-orders', vars.walletPubkey] });
    },
    onError: (err: Error) => {
      addToast({ type: 'error', message: err.message || 'Cancel failed' });
    },
  });
}
