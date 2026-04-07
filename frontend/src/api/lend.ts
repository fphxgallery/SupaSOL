import { apiFetch } from './client';

export interface LendToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  apy?: number;
  tvl?: number;
  supplyApy?: number;
  borrowApy?: number;
}

export interface LendPosition {
  mint: string;
  symbol?: string;
  depositedAmount?: number;
  depositedValue?: number;
  earnedAmount?: number;
  apy?: number;
}

export interface LendEarnings {
  totalEarned?: number;
  positions?: LendPosition[];
}

export async function fetchLendTokens(): Promise<LendToken[]> {
  const resp = await apiFetch<LendToken[]>('/api/lend/earn/tokens');
  return Array.isArray(resp) ? resp : [];
}

export async function fetchLendPositions(wallet: string): Promise<LendPosition[]> {
  const resp = await apiFetch<LendPosition[]>(`/api/lend/earn/positions?wallet=${wallet}`);
  return Array.isArray(resp) ? resp : [];
}

export async function fetchLendEarnings(wallet: string): Promise<LendEarnings> {
  return apiFetch<LendEarnings>(`/api/lend/earn/earnings?wallet=${wallet}`);
}

export interface LendDepositParams {
  wallet: string;
  mint: string;
  amount: number; // in base units
}

export async function buildLendDeposit(params: LendDepositParams): Promise<{ transaction: string }> {
  return apiFetch<{ transaction: string }>('/api/lend/earn/deposit', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function buildLendWithdraw(params: LendDepositParams): Promise<{ transaction: string }> {
  return apiFetch<{ transaction: string }>('/api/lend/earn/withdraw', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
