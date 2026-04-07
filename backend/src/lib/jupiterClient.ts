import { config } from '../config';

const BASE = 'https://api.jup.ag';

export interface JupiterError {
  status: number;
  code: string | number;
  message: string;
  retryable: boolean;
}

export async function jupiterFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      'x-api-key': config.jupiterApiKey,
    },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 10;
    throw { status: 429, code: 'RATE_LIMITED', message: 'Rate limited', retryable: true, retryAfter };
  }

  if (!res.ok) {
    const raw = await res.text();
    let body: Record<string, unknown> = { message: raw || `HTTP_${res.status}` };
    try { body = raw ? JSON.parse(raw) : body; } catch { /* keep text */ }
    throw { status: res.status, code: body['code'] ?? `HTTP_${res.status}`, message: body['message'] ?? raw, retryable: false };
  }

  // Some endpoints return empty body (204)
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}
