import { apiFetch } from './client';

export type RecurringStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface RecurringOrder {
  id: string;
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  inAmountPerCycle: string;
  cycleFrequency: number; // seconds between cycles
  totalCycles: number;
  completedCycles: number;
  status: RecurringStatus;
  createdAt: string;
  nextCycleAt?: string;
  inputSymbol?: string;
  outputSymbol?: string;
}

export interface RecurringOrdersResponse {
  orders: RecurringOrder[];
}

export interface CreateRecurringParams {
  userPublicKey: string;
  inputMint: string;
  outputMint: string;
  inAmount: number;       // total amount in base units
  inAmountPerCycle: number; // amount per order in base units
  cycleSecondsApart: number; // interval in seconds
  minOutAmount?: number;
  maxOutAmount?: number;
  startAt?: number;       // unix timestamp
}

export async function fetchRecurringOrders(wallet: string): Promise<RecurringOrdersResponse> {
  return apiFetch<RecurringOrdersResponse>(`/api/recurring/getRecurringOrders?wallet=${wallet}&orderStatus=active`);
}

export async function buildRecurringOrder(params: CreateRecurringParams): Promise<{ transaction: string; requestId: string }> {
  return apiFetch<{ transaction: string; requestId: string }>('/api/recurring/createOrder', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function executeRecurringOrder(signedTransaction: string, requestId: string): Promise<{ status: string; signature?: string }> {
  return apiFetch('/api/recurring/execute', {
    method: 'POST',
    body: JSON.stringify({ signedTransaction, requestId }),
  });
}

export async function cancelRecurringOrder(orderId: string, userPublicKey: string): Promise<{ transaction: string }> {
  return apiFetch('/api/recurring/cancelOrder', {
    method: 'POST',
    body: JSON.stringify({ orderId, userPublicKey }),
  });
}
