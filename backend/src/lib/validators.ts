import type { Request, Response } from 'express';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isBase58Address(s: unknown): s is string {
  return typeof s === 'string' && BASE58_RE.test(s);
}

export function requireBase58Param(req: Request, res: Response, name: string): string | null {
  const v = req.params[name];
  if (!isBase58Address(v)) {
    res.status(400).json({ error: `Invalid ${name}` });
    return null;
  }
  return v;
}

export function requireWhitelistParam(
  req: Request,
  res: Response,
  name: string,
  allowed: readonly string[]
): string | null {
  const v = req.params[name];
  if (typeof v !== 'string' || !allowed.includes(v)) {
    res.status(400).json({ error: `Invalid ${name}` });
    return null;
  }
  return v;
}

export const JUP_TOKEN_CATEGORIES = ['toporganicscore', 'toptraded', 'toptrending'] as const;
export const JUP_TOKEN_INTERVALS = ['5m', '1h', '6h', '24h'] as const;
