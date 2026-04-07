interface CachedToken {
  token: string;
  expiresAt: number;
}

// Per-wallet JWT token cache for Trigger API
const cache = new Map<string, CachedToken>();

export function getToken(walletPubkey: string): string | null {
  const entry = cache.get(walletPubkey);
  if (!entry) return null;
  // Expire 60s before actual expiry to avoid race conditions
  if (Date.now() >= entry.expiresAt - 60_000) {
    cache.delete(walletPubkey);
    return null;
  }
  return entry.token;
}

export function setToken(walletPubkey: string, token: string, expiresInMs: number): void {
  cache.set(walletPubkey, { token, expiresAt: Date.now() + expiresInMs });
}

export function clearToken(walletPubkey: string): void {
  cache.delete(walletPubkey);
}
