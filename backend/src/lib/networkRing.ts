export type NetSource = 'jupiter' | 'openai' | 'solana' | 'telegram' | 'other';

export interface NetEntry {
  id: string;
  ts: number;
  source: NetSource;
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  ok: boolean;
  error?: string;
}

const MAX = 1000;
const ring: NetEntry[] = [];

function nextId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function classify(url: string): NetSource {
  if (url.includes('api.jup.ag') || url.includes('jup.ag')) return 'jupiter';
  if (url.includes('openai.com')) return 'openai';
  if (url.includes('solana') || url.includes('rpc') || url.includes('helius') || url.includes('quiknode') || url.includes('mainnet-beta')) return 'solana';
  if (url.includes('telegram') || url.includes('t.me')) return 'telegram';
  return 'other';
}

function redact(url: string): string {
  // Strip query-string secrets / API keys
  return url.replace(/([?&])(api[-_]?key|token|secret)=[^&]+/gi, '$1$2=***');
}

export function pushNet(entry: Omit<NetEntry, 'id' | 'ts'>): void {
  ring.unshift({ ...entry, id: nextId(), ts: Date.now() });
  if (ring.length > MAX) ring.length = MAX;
}

export function getNet(sinceTs?: number, limit = 500): NetEntry[] {
  const filtered = sinceTs ? ring.filter((e) => e.ts > sinceTs) : ring;
  return filtered.slice(0, limit);
}

export function clearNet(): void {
  ring.length = 0;
}

let installed = false;

export function installFetchInterceptor(): void {
  if (installed) return;
  installed = true;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const source = classify(url);
    const safeUrl = redact(url);
    const start = Date.now();
    try {
      const res = await orig(input, init);
      pushNet({ source, method, url: safeUrl, status: res.status, durationMs: Date.now() - start, ok: res.ok });
      return res;
    } catch (err) {
      pushNet({
        source,
        method,
        url: safeUrl,
        durationMs: Date.now() - start,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}
