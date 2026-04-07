import { apiFetch } from './client';

export type OrderType = 'single' | 'oco' | 'otoco';
export type TriggerCondition = 'above' | 'below';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'expired';

export interface TriggerOrder {
  id: string;
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount?: string;
  triggerPrice: string;
  triggerCondition: TriggerCondition;
  status: OrderStatus;
  orderType: OrderType;
  createdAt: string;
  updatedAt?: string;
  filledAt?: string;
}

export interface TriggerOrdersResponse {
  orders: TriggerOrder[];
  total?: number;
  page?: number;
}

export interface ChallengeResponse {
  challenge: string;
}

export interface AuthVerifyResponse {
  token: string;
}

// JWT auth flow
export async function getTriggerChallenge(walletPubkey: string): Promise<ChallengeResponse> {
  return apiFetch<ChallengeResponse>('/api/trigger/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ walletPubkey, type: 'ed25519' }),
  });
}

export async function verifyTriggerAuth(walletPubkey: string, signature: string): Promise<AuthVerifyResponse> {
  return apiFetch<AuthVerifyResponse>('/api/trigger/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ walletPubkey, signature, type: 'ed25519' }),
  });
}

export async function fetchTriggerOrders(walletPubkey: string): Promise<TriggerOrdersResponse> {
  return apiFetch<TriggerOrdersResponse>(`/api/trigger/orders/history?walletPubkey=${walletPubkey}`);
}
