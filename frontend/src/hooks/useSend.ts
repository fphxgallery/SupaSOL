import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSignAndSend } from './useSignAndSend';
import { useUiStore } from '../store/uiStore';
import {
  craftSend, craftClawback,
  fetchPendingInvites, fetchInviteHistory,
  type CraftSendParams,
} from '../api/send';

export function usePendingInvites(walletPubkey: string | null) {
  return useQuery({
    queryKey: ['pending-invites', walletPubkey],
    queryFn: () => fetchPendingInvites(walletPubkey!),
    enabled: !!walletPubkey,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useInviteHistory(walletPubkey: string | null) {
  return useQuery({
    queryKey: ['invite-history', walletPubkey],
    queryFn: () => fetchInviteHistory(walletPubkey!),
    enabled: !!walletPubkey,
    retry: false,
  });
}

export function useSendInvite() {
  const { signAndSend } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { walletPubkey: string; mint: string; amount: number; memo?: string }) => {
      const resp = await craftSend({
        senderPubkey: params.walletPubkey,
        mint: params.mint,
        amount: params.amount,
        memo: params.memo,
      });

      // Sign and send the send transaction
      const sig = await signAndSend(resp.transaction, 'Send Invite');

      return {
        sig,
        inviteCode: resp.inviteCode,
        inviteKeypairBase58: resp.inviteKeypairBase58,
      };
    },
    onSuccess: (result, vars) => {
      if (result.inviteCode) {
        addToast({ type: 'success', message: `Invite created: ${result.inviteCode}` });
      } else {
        addToast({ type: 'success', message: 'Tokens sent!', txSig: result.sig });
      }
      queryClient.invalidateQueries({ queryKey: ['pending-invites', vars.walletPubkey] });
    },
    onError: (err: Error) => {
      addToast({ type: 'error', message: err.message || 'Send failed' });
    },
  });
}

export function useClawback() {
  const { signAndSend } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ senderPubkey, inviteCode }: { senderPubkey: string; inviteCode: string }) => {
      const resp = await craftClawback({ senderPubkey, inviteCode });
      return signAndSend(resp.transaction, 'Clawback Invite');
    },
    onSuccess: (sig, vars) => {
      addToast({ type: 'success', message: 'Invite clawed back', txSig: sig });
      queryClient.invalidateQueries({ queryKey: ['pending-invites', vars.senderPubkey] });
    },
    onError: (err: Error) => {
      addToast({ type: 'error', message: err.message || 'Clawback failed' });
    },
  });
}
