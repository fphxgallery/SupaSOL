import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchPerpsMarkets,
  fetchPerpsPrices,
  fetchPerpsPositions,
  previewOpenPosition,
  buildOpenPosition,
  buildClosePosition,
  buildAddCollateral,
  buildRemoveCollateral,
  buildPlaceTriggerOrder,
  buildCancelTriggerOrder,
  type OpenPositionParams,
  type PerpsMarket,
} from '../api/perps';
import { useSignAndSend } from './useSignAndSend';
import { useUiStore } from '../store/uiStore';

function onMutationError(label: string) {
  return (err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Transaction failed';
    useUiStore.getState().addToast({ type: 'error', message: `${label}: ${msg}` });
  };
}

export function usePerpsMarkets() {
  return useQuery({
    queryKey: ['perps-markets'],
    queryFn: fetchPerpsMarkets,
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

export function usePerpsPrices() {
  return useQuery({
    queryKey: ['perps-prices'],
    queryFn: fetchPerpsPrices,
    refetchInterval: 5_000,
    staleTime: 4_000,
    retry: 1,
  });
}

export function usePerpsPositions(wallet: string | null, markets: PerpsMarket[]) {
  return useQuery({
    queryKey: ['perps-positions', wallet],
    queryFn: () => fetchPerpsPositions(wallet!, markets),
    enabled: !!wallet && markets.length > 0,
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function usePerpsPreview(params: Partial<OpenPositionParams> | null) {
  const enabled =
    params != null &&
    !!params.marketPubkey &&
    (params.collateralUi ?? 0) > 0 &&
    (params.leverage ?? 0) > 0 &&
    (params.markPriceUi ?? 0) > 0;

  return useQuery({
    queryKey: [
      'perps-preview',
      params?.marketPubkey,
      params?.side,
      params?.collateralUi,
      params?.leverage,
      params?.markPriceUi,
    ],
    queryFn: () => previewOpenPosition(params as OpenPositionParams),
    enabled,
    refetchInterval: 5_000,
    staleTime: 4_000,
    retry: false,
  });
}

export function usePerpsOpen() {
  const { signAndSend } = useSignAndSend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: OpenPositionParams & { wallet: string }) => {
      const { transaction } = await buildOpenPosition({ ...params, owner: params.wallet });
      return signAndSend(
        transaction,
        `Open ${params.side === 'long' ? '↑ Long' : '↓ Short'} ${params.marketPubkey.slice(0, 4)}`,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
    onError: onMutationError('Open position'),
  });
}

export function usePerpsClose() {
  const { signAndSend } = useSignAndSend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wallet,
      positionPubkey,
      sizeUsd,
      symbol,
    }: {
      wallet: string;
      positionPubkey: string;
      sizeUsd: number;
      symbol: string;
    }) => {
      const { transaction } = await buildClosePosition(wallet, positionPubkey, sizeUsd);
      return signAndSend(transaction, `Close ${symbol} Position`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
    onError: onMutationError('Close position'),
  });
}

export function usePerpsAddCollateral() {
  const { signAndSend } = useSignAndSend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wallet,
      positionPubkey,
      amountUi,
      symbol,
    }: {
      wallet: string;
      positionPubkey: string;
      amountUi: number;
      symbol: string;
    }) => {
      const { transaction } = await buildAddCollateral(wallet, positionPubkey, amountUi);
      return signAndSend(transaction, `Add Collateral — ${symbol}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
    onError: onMutationError('Add collateral'),
  });
}

export function usePerpsRemoveCollateral() {
  const { signAndSend } = useSignAndSend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wallet,
      positionPubkey,
      amountUsdUi,
      symbol,
    }: {
      wallet: string;
      positionPubkey: string;
      amountUsdUi: number;
      symbol: string;
    }) => {
      const { transaction } = await buildRemoveCollateral(wallet, positionPubkey, amountUsdUi);
      return signAndSend(transaction, `Remove Collateral — ${symbol}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
    onError: onMutationError('Remove collateral'),
  });
}

export function usePerpsTrigger() {
  const { signAndSend } = useSignAndSend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wallet,
      positionPubkey,
      triggerPriceUi,
      isStopLoss,
      marketSymbol,
      side,
      sizeUsdUi,
      symbol,
    }: {
      wallet: string;
      positionPubkey: string;
      triggerPriceUi: number;
      isStopLoss: boolean;
      marketSymbol: string;
      side: 'long' | 'short';
      sizeUsdUi: number;
      symbol: string;
    }) => {
      const { transaction } = await buildPlaceTriggerOrder(
        wallet,
        positionPubkey,
        triggerPriceUi,
        isStopLoss,
        marketSymbol,
        side,
        sizeUsdUi,
      );
      return signAndSend(
        transaction,
        isStopLoss ? `Set Stop Loss — ${symbol}` : `Set Take Profit — ${symbol}`,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
    onError: onMutationError('Set trigger'),
  });
}

export function useCancelTrigger() {
  const { signAndSend } = useSignAndSend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wallet,
      positionPubkey,
      isStopLoss,
      marketSymbol,
      side,
      symbol,
    }: {
      wallet: string;
      positionPubkey: string;
      isStopLoss: boolean;
      marketSymbol: string;
      side: 'long' | 'short';
      symbol: string;
    }) => {
      const { transaction } = await buildCancelTriggerOrder(wallet, positionPubkey, isStopLoss, marketSymbol, side);
      return signAndSend(transaction, `Cancel Order — ${symbol}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
    onError: onMutationError('Cancel order'),
  });
}
