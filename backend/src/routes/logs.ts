import { Router } from 'express';
import { getLogs, clearLogs } from '../lib/logRing';
import { getNet, clearNet } from '../lib/networkRing';

const router = Router();

function parseSince(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseLimit(v: unknown, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 2000);
}

router.get('/backend', (req, res) => {
  const since = parseSince(req.query['since']);
  const limit = parseLimit(req.query['limit'], 500);
  res.json({ entries: getLogs(since, limit) });
});

router.delete('/backend', (_req, res) => {
  clearLogs();
  res.json({ ok: true });
});

router.get('/network', (req, res) => {
  const since = parseSince(req.query['since']);
  const limit = parseLimit(req.query['limit'], 500);
  res.json({ entries: getNet(since, limit) });
});

router.delete('/network', (_req, res) => {
  clearNet();
  res.json({ ok: true });
});

export default router;
