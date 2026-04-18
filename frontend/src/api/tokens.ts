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

interface JupStats {
  priceChange?: number;
  buyVolume?: number;
  sellVolume?: number;
  volume?: number;
  numOrganicBuyers?: number;
}

interface JupTrendingRaw {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  usdPrice?: number;
  mcap?: number;
  fdv?: number;
  liquidity?: number;
  holderCount?: number;
  organicScore?: number;
  tags?: string[];
  audit?: TokenInfo['audit'];
  stats5m?: JupStats;
  stats1h?: JupStats;
  stats6h?: JupStats;
  stats24h?: JupStats;
}

export interface TrendingToken extends TokenInfo {
  usdPrice?: number;
  mcap?: number;
  fdv?: number;
  liquidity?: number;
  holderCount?: number;
  stats: Partial<Record<'5m' | '1h' | '6h' | '24h', { priceChange?: number; volume?: number; numOrganicBuyers?: number }>>;
}

function normalizeTrending(t: JupTrendingRaw): TrendingToken {
  const vol = (s?: JupStats) =>
    s ? ((s.buyVolume ?? 0) + (s.sellVolume ?? 0)) || s.volume : undefined;
  return {
    address: t.id,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    logoURI: t.icon,
    tags: t.tags,
    organicScore: t.organicScore,
    daily_volume: t.stats24h?.volume ?? vol(t.stats24h),
    audit: t.audit,
    usdPrice: t.usdPrice,
    mcap: t.mcap,
    fdv: t.fdv,
    liquidity: t.liquidity,
    holderCount: t.holderCount,
    stats: {
      '5m':  t.stats5m  ? { priceChange: t.stats5m.priceChange,  volume: vol(t.stats5m),  numOrganicBuyers: t.stats5m.numOrganicBuyers  } : undefined,
      '1h':  t.stats1h  ? { priceChange: t.stats1h.priceChange,  volume: vol(t.stats1h),  numOrganicBuyers: t.stats1h.numOrganicBuyers  } : undefined,
      '6h':  t.stats6h  ? { priceChange: t.stats6h.priceChange,  volume: vol(t.stats6h),  numOrganicBuyers: t.stats6h.numOrganicBuyers  } : undefined,
      '24h': t.stats24h ? { priceChange: t.stats24h.priceChange, volume: vol(t.stats24h), numOrganicBuyers: t.stats24h.numOrganicBuyers } : undefined,
    },
  };
}

export async function fetchTrendingTokens(interval: '5m' | '1h' | '6h' | '24h' = '24h'): Promise<TrendingToken[]> {
  const resp = await apiFetch<JupTrendingRaw[]>(`/api/tokens/toptrending/${interval}`);
  return Array.isArray(resp) ? resp.map(normalizeTrending) : [];
}
