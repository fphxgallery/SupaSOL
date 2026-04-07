export function formatSol(lamports: number): string {
  return (lamports / 1e9).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatUsdCompact(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(2)}K`;
  return formatUsd(amount);
}

export function formatPct(value: number, decimals = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function shortenPubkey(pubkey: string, chars = 4): string {
  if (!pubkey) return '';
  return `${pubkey.slice(0, chars)}...${pubkey.slice(-chars)}`;
}

export function formatTokenAmount(amount: number, decimals = 6): string {
  const val = amount / Math.pow(10, decimals);
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(2)}K`;
  return val.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}
