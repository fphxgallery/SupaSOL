import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRecurringOrders, buildRecurringOrder, executeRecurringOrder, cancelRecurringOrder, type CreateRecurringParams } from '../api/recurring';
import { useSignAndSend } from './useSignAndSend';
import { useUiStore } from '../store/uiStore';

export function useRecurringOrders(wallet: string | null) {
  return useQuery({
    queryKey: ['recurring-orders', wallet],
    queryFn: () => fetchRecurringOrders(wallet!),
    enabled: !!wallet,
    refetchInterval: 30_000,
  });
}

export function useCreateRecurring() {
  const { signTransaction } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateRecurringParams) => {
      const { transaction, requestId } = await buildRecurringOrder(params);
      const signedTx = await signTransaction(transaction);
      const result = await executeRecurringOrder(signedTx, requestId);
      return result;
    },
    onSuccess: () => {
      addToast({ type: 'success', message: 'DCA order created!' });
      queryClient.invalidateQueries({ queryKey: ['recurring-orders'] });
    },
    onError: (err: Error) => {
      addToast({ type: 'error', message: err.message || 'Failed to create DCA order' });
    },
  });
}

export function useCancelRecurring() {
  const { signAndSend } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, userPublicKey }: { orderId: string; userPublicKey: string }) => {
      const { transaction } = await cancelRecurringOrder(orderId, userPublicKey);
      return signAndSend(transaction, 'Cancel DCA order');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-orders'] });
    },
    onError: (err: Error) => {
      addToast({ type: 'error', message: err.message || 'Failed to cancel order' });
    },
  });
}
