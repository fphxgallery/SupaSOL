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
  organicScore?: number;
  audit?: {
    isMintable?: boolean;
    isFreezable?: boolean;
    isMutable?: boolean;
    isSus?: boolean;
    warnings?: string[];
  };
}

// Jupiter v2 search API shape (field names differ from the token list)
interface JupV2Token {
  id?: string;
  address?: string;
  name: string;
  symbol: string;
  decimals: number;
  icon?: string;
  logoURI?: string;
  tags?: string[];
  organicScore?: number;
  stats24h?: { volume?: number };
  daily_volume?: number;
  audit?: TokenInfo['audit'];
}

function normalizeToken(t: JupV2Token): TokenInfo {
  return {
    address: t.id ?? t.address ?? '',
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    logoURI: t.icon ?? t.logoURI,
    tags: t.tags,
    organicScore: t.organicScore,
    daily_volume: t.daily_volume ?? t.stats24h?.volume,
    audit: t.audit,
  };
}

export async function searchTokens(query: string): Promise<TokenInfo[]> {
  if (!query.trim()) return [];
  const resp = await apiFetch<JupV2Token[]>(`/api/tokens/search?query=${encodeURIComponent(query)}`);
  return Array.isArray(resp) ? resp.map(normalizeToken) : [];
}

export async function fetchVerifiedTokens(): Promise<TokenInfo[]> {
  const resp = await apiFetch<TokenInfo[]>('/api/tokens/tag?query=verified');
  return Array.isArray(resp) ? resp : [];
}

export async function fetchTrendingTokens(interval: '5m' | '1h' | '6h' | '24h' = '24h'): Promise<TokenInfo[]> {
  const resp = await apiFetch<TokenInfo[]>(`/api/tokens/toptrending/${interval}`);
  return Array.isArray(resp) ? resp : [];
}
