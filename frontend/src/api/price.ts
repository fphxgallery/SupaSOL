import { apiFetch } from './client';

// Jupiter Price v3 response — returns mint addresses as top-level keys
export interface TokenPrice {
  usdPrice: number;
  priceChange24h?: number;
  liquidity?: number;
  decimals?: number;
  blockId?: number;
  // Legacy alias so callers using .price still work
  price?: string | null;
}

/** Fetch prices for up to 50 mint addresses at once. */
export async function fetchPrices(mints: string[]): Promise<Record<string, TokenPrice>> {
  if (mints.length === 0) return {};
  const batch = mints.slice(0, 50);
  const resp = await apiFetch<Record<string, TokenPrice>>(`/api/price?ids=${batch.join(',')}`);

  // Normalize: add a .price string alias for backwards compat
  const result: Record<string, TokenPrice> = {};
  for (const [mint, info] of Object.entries(resp ?? {})) {
    if (info && typeof info.usdPrice === 'number') {
      result[mint] = { ...info, price: String(info.usdPrice) };
    }
  }
  return result;
}
