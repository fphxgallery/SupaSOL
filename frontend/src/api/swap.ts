import { apiFetch } from './client';

export interface SwapOrderParams {
  inputMint: string;
  outputMint: string;
  amount: number; // in lamports / smallest unit
  userPublicKey: string;
  slippageBps?: number;
  /** 'ExactIn' (default) or 'ExactOut' */
  swapMode?: 'ExactIn' | 'ExactOut';
}

export interface SwapOrderResponse {
  transaction: string; // base64 unsigned VersionedTransaction
  requestId: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  priceImpactPct: string;
  routePlan?: unknown[];
  swapType?: string;
  mode?: 'ultra' | 'manual';
}

export interface SwapExecuteResponse {
  status: 'Success' | 'Failed';
  signature?: string;
  error?: string;
  code?: number;
  inputAmountResult?: string;
  outputAmountResult?: string;
}

export async function getSwapOrder(params: SwapOrderParams): Promise<SwapOrderResponse> {
  const qs = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount.toString(),
    userPublicKey: params.userPublicKey,
    ...(params.slippageBps !== undefined && { slippageBps: params.slippageBps.toString() }),
    ...(params.swapMode && { swapMode: params.swapMode }),
  });
  return apiFetch<SwapOrderResponse>(`/api/swap/order?${qs}`);
}

export async function executeSwap(signedTransaction: string, requestId: string): Promise<SwapExecuteResponse> {
  return apiFetch<SwapExecuteResponse>('/api/swap/execute', {
    method: 'POST',
    body: JSON.stringify({ signedTransaction, requestId }),
  });
}
