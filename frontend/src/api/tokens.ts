import { apiFetch } from './client';

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
  extensions?: Record<string, unknown>;
  daily_volume?: number;
  created_at?: string;
  freeze_authority?: string | null;
  mint_authority?: string | null;
  permanent_delegate?: string | null;
  minted_at?: string;
  organicScore?: number;
  audit?: {
    isMintable?: boolean;
    isFreezable?: boolean;
    isMutable?: boolean;
    isSus?: boolean;
    warnings?: string[];
  };
}

export async function searchTokens(query: string): Promise<TokenInfo[]> {
  if (!query.trim()) return [];
  const resp = await apiFetch<TokenInfo[]>(`/api/tokens/search?query=${encodeURIComponent(query)}`);
  return Array.isArray(resp) ? resp : [];
}

export async function fetchVerifiedTokens(): Promise<TokenInfo[]> {
  const resp = await apiFetch<TokenInfo[]>('/api/tokens/tag?query=verified');
  return Array.isArray(resp) ? resp : [];
}

export async function fetchTrendingTokens(interval: '5m' | '1h' | '6h' | '24h' = '24h'): Promise<TokenInfo[]> {
  const resp = await apiFetch<TokenInfo[]>(`/api/tokens/toptrending/${interval}`);
  return Array.isArray(resp) ? resp : [];
}
