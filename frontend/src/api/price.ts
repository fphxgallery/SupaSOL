import { apiFetch } from './client';

export interface TokenPrice {
  usdPrice: number;
  priceChange24h?: number;
  liquidity?: number;
  decimals?: number;
}

// Jupiter Price v3 can return two shapes depending on API key / endpoint version:
//   New (no-key / public):  { "<mint>": { usdPrice: number, ... } }
//   Old (API key / portal): { data: { "<mint>": { id, type, price: "string" } } }
interface RawOldEntry  { id?: string; type?: string; price?: string | null }
interface RawNewEntry  { usdPrice?: number; priceChange24h?: number; liquidity?: number; decimals?: number }
type RawResponse =
  | { data: Record<string, RawOldEntry>; timeTaken?: number }   // old portal format
  | Record<string, RawNewEntry>;                                 // new public format

/** Fetch prices for up to 50 mint addresses at once. */
export async function fetchPrices(mints: string[]): Promise<Record<string, TokenPrice>> {
  if (mints.length === 0) return {};
  const batch = mints.slice(0, 50);
  const raw = await apiFetch<RawResponse>(`/api/price?ids=${batch.join(',')}`);

  const result: Record<string, TokenPrice> = {};

  // Detect old format: has a "data" key whose value is an object (not a price entry)
  if (raw && 'data' in raw && raw.data && typeof raw.data === 'object' && !('usdPrice' in raw.data)) {
    // Old format: { data: { "<mint>": { price: "79.11" } } }
    const entries = raw.data as Record<string, RawOldEntry>;
    for (const [mint, entry] of Object.entries(entries)) {
      const price = entry?.price ? parseFloat(entry.price) : null;
      if (price !== null && !isNaN(price)) {
        result[mint] = { usdPrice: price };
      }
    }
  } else {
    // New format: { "<mint>": { usdPrice: 79.11 } }
    const entries = raw as Record<string, RawNewEntry>;
    for (const [mint, entry] of Object.entries(entries)) {
      const price = entry?.usdPrice;
      if (typeof price === 'number' && !isNaN(price)) {
        result[mint] = {
          usdPrice: price,
          priceChange24h: entry.priceChange24h,
          liquidity: entry.liquidity,
          decimals: entry.decimals,
        };
      }
    }
  }

  return result;
}
