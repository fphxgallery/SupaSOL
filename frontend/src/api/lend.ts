import { apiFetch } from './client';

// ─── Raw Jupiter API shapes ──────────────────────────────────────────────────

interface RawAsset {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logo_url?: string;
  price?: string;
}

interface RawTokenInfo {
  id: number;
  address: string;       // jlToken mint
  name: string;          // e.g. "Jupiter Lend USDC"
  symbol: string;        // e.g. "jlUSDC"
  decimals: number;
  assetAddress: string;  // underlying asset mint
  asset: RawAsset;
  totalAssets?: string;
  totalSupply?: string;
  supplyRate?: string;
  rewardsRate?: string;
  totalRate?: string;
}

interface RawUserPosition {
  token: RawTokenInfo;
  ownerAddress: string;
  shares: string;
  underlyingAssets?: string;    // base units deposited + accrued interest
  underlyingBalance?: string;   // USD value as string (e.g. "17.72")
  allowance?: string;
}

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface LendToken {
  mint: string;       // underlying asset mint
  jlMint: string;     // jlToken mint
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  supplyApy?: number; // as percentage (e.g. 3.0 for 3%)
  tvl?: number;       // USD value
}

export interface LendPosition {
  mint: string;
  jlMint: string;
  symbol?: string;
  decimals?: number;
  depositedAmount?: number;   // in UI units (divided by 10^decimals)
  depositedValue?: number;    // USD value
  apy?: number;               // as percentage
}

export interface LendEarnings {
  totalDeposited?: number;
  positions?: LendPosition[];
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeToken(raw: RawTokenInfo): LendToken {
  // totalRate is in 1e4 basis-point format: e.g. "376" means 376 bps = 3.76%
  // Divide by 100 to convert basis points → percentage display value.
  const supplyApy = raw.totalRate != null ? parseFloat(raw.totalRate) / 100 : undefined;
  const assetPrice = raw.asset.price ? parseFloat(raw.asset.price) : null;
  const totalAssetsBase = raw.totalAssets ? parseFloat(raw.totalAssets) : null;
  const tvl =
    totalAssetsBase != null && assetPrice != null
      ? (totalAssetsBase / Math.pow(10, raw.asset.decimals)) * assetPrice
      : undefined;

  return {
    mint: raw.assetAddress,
    jlMint: raw.address,
    symbol: raw.asset.symbol ?? raw.symbol,
    name: raw.asset.name ?? raw.name,
    decimals: raw.asset.decimals ?? raw.decimals,
    logoURI: raw.asset.logo_url,
    supplyApy: supplyApy != null && !isNaN(supplyApy) ? supplyApy : undefined,
    tvl: tvl != null && !isNaN(tvl) ? tvl : undefined,
  };
}

function normalizePosition(raw: RawUserPosition): LendPosition {
  const decimals = raw.token.asset?.decimals ?? raw.token.decimals ?? 6;
  const underlyingBase = raw.underlyingAssets != null ? parseFloat(raw.underlyingAssets) : null;
  const depositedAmount =
    underlyingBase != null && !isNaN(underlyingBase)
      ? underlyingBase / Math.pow(10, decimals)
      : undefined;

  // underlyingBalance from Jupiter is NOT a USD value — it's the wallet balance in base units.
  // Compute USD value ourselves: depositedAmount × asset price.
  const assetPrice = raw.token.asset?.price ? parseFloat(raw.token.asset.price) : null;
  const depositedValue =
    depositedAmount != null && assetPrice != null && !isNaN(assetPrice)
      ? depositedAmount * assetPrice
      : undefined;

  // totalRate is in 1e4 basis-point format — divide by 100 for percentage.
  const apy = raw.token.totalRate != null ? parseFloat(raw.token.totalRate) / 100 : undefined;

  return {
    mint: raw.token.assetAddress,
    jlMint: raw.token.address,
    symbol: raw.token.asset?.symbol ?? raw.token.symbol,
    decimals,
    depositedAmount,
    depositedValue: depositedValue != null && !isNaN(depositedValue) ? depositedValue : undefined,
    apy: apy != null && !isNaN(apy) ? apy : undefined,
  };
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function fetchLendTokens(): Promise<LendToken[]> {
  const resp = await apiFetch<RawTokenInfo[]>('/api/lend/earn/tokens');
  if (!Array.isArray(resp)) return [];
  return resp.map(normalizeToken);
}

export async function fetchLendPositions(wallet: string): Promise<LendPosition[]> {
  // Jupiter expects ?users= (comma-separated, supports multiple)
  const resp = await apiFetch<RawUserPosition[]>(`/api/lend/earn/positions?users=${wallet}`);
  if (!Array.isArray(resp)) return [];
  // Filter to active positions only — API returns all ever-touched tokens including zero-balance ones.
  const active = resp.filter((p) => {
    const shares = parseFloat(p.shares ?? '0');
    const underlying = parseFloat(p.underlyingAssets ?? '0');
    return shares > 0 || underlying > 0;
  });
  return active.map(normalizePosition);
}

export async function fetchLendEarnings(wallet: string): Promise<LendEarnings> {
  // Compute summary from positions data (earnings endpoint requires jlToken addresses
  // as a dependency which we don't have independently)
  const positions = await fetchLendPositions(wallet);
  const totalDeposited = positions.reduce((acc, p) => acc + (p.depositedValue ?? 0), 0);
  return { totalDeposited, positions };
}

export interface LendDepositParams {
  wallet: string;
  mint: string;    // underlying asset mint (assetAddress)
  amount: number;  // in base units (will be stringified for Jupiter)
}

export async function buildLendDeposit(params: LendDepositParams): Promise<{ transaction: string }> {
  return apiFetch<{ transaction: string }>('/api/lend/earn/deposit', {
    method: 'POST',
    body: JSON.stringify({
      signer: params.wallet,
      asset: params.mint,
      amount: String(params.amount),
    }),
  });
}

export async function buildLendWithdraw(params: LendDepositParams): Promise<{ transaction: string }> {
  return apiFetch<{ transaction: string }>('/api/lend/earn/withdraw', {
    method: 'POST',
    body: JSON.stringify({
      signer: params.wallet,
      asset: params.mint,
      amount: String(params.amount),
    }),
  });
}
