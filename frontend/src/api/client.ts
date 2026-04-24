import { API_BASE } from '../config/constants';

export class ApiError extends Error {
  status?: number;
  code: string | number;
  retryable: boolean;
  constructor(message: string, opts: { status?: number; code: string | number; retryable: boolean }) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.retryable = opts.retryable;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 10;
    throw new ApiError(`Rate limited — retry in ${retryAfter}s`, { status: 429, code: 'RATE_LIMITED', retryable: true });
  }

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }

  if (!res.ok) {
    // Flash Trade and some other APIs return error details in an 'err' field
    throw new ApiError(
      (body['err'] as string) ?? (body['message'] as string) ?? `HTTP ${res.status}`,
      {
        status: res.status,
        code: (body['code'] as string | number) ?? `HTTP_${res.status}`,
        retryable: res.status >= 500,
      },
    );
  }

  return body as T;
}

export async function withRetry<T>(action: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await action();
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (!apiErr.retryable || attempt === maxRetries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10_000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Retry exhausted');
}
