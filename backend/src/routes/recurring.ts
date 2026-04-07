import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();
const JUP_BASE = 'https://api.jup.ag';

async function proxyToJupiter(req: Request, res: Response, jupPath: string) {
  const url = new URL(`${JUP_BASE}${jupPath}`);
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }
  const init: RequestInit = {
    method: req.method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.jupiterApiKey },
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = JSON.stringify(req.body);
  const upstream = await fetch(url.toString(), init);
  const text = await upstream.text();
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
}

router.post('/createOrder', (req, res) => proxyToJupiter(req, res, '/recurring/v1/createOrder'));
router.post('/cancelOrder', (req, res) => proxyToJupiter(req, res, '/recurring/v1/cancelOrder'));
router.post('/execute', (req, res) => proxyToJupiter(req, res, '/recurring/v1/execute'));
router.get('/getRecurringOrders', (req, res) => proxyToJupiter(req, res, '/recurring/v1/getRecurringOrders'));

export default router;
