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
      return signAndSend(transaction, `Open ${params.side.toUpperCase()} ${params.marketPubkey.slice(0, 4)}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
  });
}

export function usePerpsClose() {
  const { signAndSend } = useSignAndSend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wallet,
      positionPubkey,
      symbol,
    }: {
      wallet: string;
      positionPubkey: string;
      symbol: string;
    }) => {
      const { transaction } = await buildClosePosition(wallet, positionPubkey);
      return signAndSend(transaction, `Close ${symbol} Position`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
  });
}

export function usePerpsAddCollateral() {
  const { signAndSend } = useSignAndSend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wallet,
      positionPubkey,
      amountBase,
      symbol,
    }: {
      wallet: string;
      positionPubkey: string;
      amountBase: number;
      symbol: string;
    }) => {
      const { transaction } = await buildAddCollateral(wallet, positionPubkey, amountBase);
      return signAndSend(transaction, `Add Collateral — ${symbol}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
  });
}

export function usePerpsRemoveCollateral() {
  const { signAndSend } = useSignAndSend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wallet,
      positionPubkey,
      amountBase,
      symbol,
    }: {
      wallet: string;
      positionPubkey: string;
      amountBase: number;
      symbol: string;
    }) => {
      const { transaction } = await buildRemoveCollateral(wallet, positionPubkey, amountBase);
      return signAndSend(transaction, `Remove Collateral — ${symbol}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
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
      symbol,
    }: {
      wallet: string;
      positionPubkey: string;
      triggerPriceUi: number;
      isStopLoss: boolean;
      symbol: string;
    }) => {
      const { transaction } = await buildPlaceTriggerOrder(
        wallet,
        positionPubkey,
        triggerPriceUi,
        isStopLoss,
      );
      const label = isStopLoss ? `Set Stop Loss — ${symbol}` : `Set Take Profit — ${symbol}`;
      return signAndSend(transaction, label);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
  });
}

export function useCancelTrigger() {
  const { signAndSend } = useSignAndSend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wallet,
      orderPubkey,
      symbol,
    }: {
      wallet: string;
      orderPubkey: string;
      symbol: string;
    }) => {
      const { transaction } = await buildCancelTriggerOrder(wallet, orderPubkey);
      return signAndSend(transaction, `Cancel Order — ${symbol}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['perps-positions', variables.wallet] });
    },
  });
}
