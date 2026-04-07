import { apiFetch } from './client';

export interface TokenPrice {
  id: string;
  type: string;
  price: string | null;
  confidenceLevel?: string;
  extraInfo?: Record<string, unknown>;
}

export interface PriceResponse {
  data: Record<string, TokenPrice>;
  timeTaken?: number;
}

/** Fetch prices for up to 50 mint addresses at once. */
export async function fetchPrices(mints: string[]): Promise<Record<string, TokenPrice>> {
  if (mints.length === 0) return {};
  // Jupiter Price v3 enforces max 50 IDs per request
  const batch = mints.slice(0, 50);
  const resp = await apiFetch<PriceResponse>(`/api/price?ids=${batch.join(',')}`);
  return resp.data ?? {};
}
