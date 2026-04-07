import { apiFetch } from './client';

export interface PortfolioPosition {
  id: string;
  platform: string;
  type: 'multiple' | 'liquidity' | 'trade' | 'leverage' | 'borrowlend' | string;
  name?: string;
  value?: number;
  tokens?: { mint: string; amount: number; symbol?: string }[];
  data?: Record<string, unknown>;
}

export interface PortfolioResponse {
  positions: PortfolioPosition[];
  totalValue?: number;
}

export async function fetchPortfolio(address: string): Promise<PortfolioResponse> {
  const resp = await apiFetch<PortfolioResponse>(`/api/portfolio/positions/${address}`);
  return { positions: resp.positions ?? [], totalValue: resp.totalValue };
}

export async function fetchPlatforms(): Promise<Record<string, unknown>[]> {
  return apiFetch<Record<string, unknown>[]>('/api/portfolio/platforms');
}
