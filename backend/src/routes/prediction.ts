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

router.get('/events', (req, res) => proxyToJupiter(req, res, '/prediction/v1/events'));
router.get('/events/search', (req, res) => proxyToJupiter(req, res, '/prediction/v1/events/search'));
router.get('/markets/:marketId', (req, res) => proxyToJupiter(req, res, `/prediction/v1/markets/${req.params['marketId']}`));
router.get('/orderbook/:marketId', (req, res) => proxyToJupiter(req, res, `/prediction/v1/orderbook/${req.params['marketId']}`));
router.post('/orders', (req, res) => proxyToJupiter(req, res, '/prediction/v1/orders'));
router.get('/orders/status/:pubkey', (req, res) => proxyToJupiter(req, res, `/prediction/v1/orders/status/${req.params['pubkey']}`));
router.get('/positions', (req, res) => proxyToJupiter(req, res, '/prediction/v1/positions'));
router.delete('/positions/:pubkey', (req, res) => proxyToJupiter(req, res, `/prediction/v1/positions/${req.params['pubkey']}`));
router.post('/positions/:pubkey/claim', (req, res) => proxyToJupiter(req, res, `/prediction/v1/positions/${req.params['pubkey']}/claim`));
router.get('/history', (req, res) => proxyToJupiter(req, res, '/prediction/v1/history'));
router.get('/leaderboards', (req, res) => proxyToJupiter(req, res, '/prediction/v1/leaderboards'));

export default router;
