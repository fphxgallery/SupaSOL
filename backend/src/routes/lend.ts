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

router.post('/earn/deposit', (req, res) => proxyToJupiter(req, res, '/lend/v1/earn/deposit'));
router.post('/earn/withdraw', (req, res) => proxyToJupiter(req, res, '/lend/v1/earn/withdraw'));
router.post('/earn/mint', (req, res) => proxyToJupiter(req, res, '/lend/v1/earn/mint'));
router.post('/earn/redeem', (req, res) => proxyToJupiter(req, res, '/lend/v1/earn/redeem'));
router.post('/earn/deposit-instructions', (req, res) => proxyToJupiter(req, res, '/lend/v1/earn/deposit-instructions'));
router.post('/earn/withdraw-instructions', (req, res) => proxyToJupiter(req, res, '/lend/v1/earn/withdraw-instructions'));
router.get('/earn/tokens', (req, res) => proxyToJupiter(req, res, '/lend/v1/earn/tokens'));
router.get('/earn/positions', (req, res) => proxyToJupiter(req, res, '/lend/v1/earn/positions'));
router.get('/earn/earnings', (req, res) => proxyToJupiter(req, res, '/lend/v1/earn/earnings'));

export default router;
