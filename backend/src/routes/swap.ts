import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();
const JUP_BASE = 'https://api.jup.ag';

async function proxyToJupiter(req: Request, res: Response, jupPath: string) {
  const url = new URL(`${JUP_BASE}${jupPath}`);
  // Forward query params
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }

  const init: RequestInit = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.jupiterApiKey,
    },
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = JSON.stringify(req.body);
  }

  const upstream = await fetch(url.toString(), init);
  const text = await upstream.text();
  res.status(upstream.status);
  res.set('Content-Type', 'application/json');
  res.send(text);
}

// GET /api/swap/order — get quote + unsigned transaction
router.get('/order', (req, res) => proxyToJupiter(req, res, '/swap/v2/order'));

// POST /api/swap/execute — submit signed transaction
router.post('/execute', (req, res) => proxyToJupiter(req, res, '/swap/v2/execute'));

// GET /api/swap/build — Metis-only raw instructions
router.get('/build', (req, res) => proxyToJupiter(req, res, '/swap/v2/build'));

export default router;
