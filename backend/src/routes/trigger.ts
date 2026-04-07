import { Router, Request, Response } from 'express';
import { config } from '../config';
import { getToken, setToken } from '../lib/triggerAuth';

const router = Router();
const JUP_BASE = 'https://api.jup.ag';

async function proxyToJupiter(req: Request, res: Response, jupPath: string, extraHeaders?: Record<string, string>) {
  const url = new URL(`${JUP_BASE}${jupPath}`);
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }
  const init: RequestInit = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.jupiterApiKey,
      ...extraHeaders,
    },
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = JSON.stringify(req.body);
  const upstream = await fetch(url.toString(), init);
  const text = await upstream.text();
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
}

// Auth: challenge
router.post('/auth/challenge', (req, res) => proxyToJupiter(req, res, '/trigger/v2/auth/challenge'));

// Auth: verify — cache the JWT on success
router.post('/auth/verify', async (req: Request, res: Response) => {
  const url = new URL(`${JUP_BASE}/trigger/v2/auth/verify`);
  const upstream = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.jupiterApiKey },
    body: JSON.stringify(req.body),
  });
  const text = await upstream.text();
  if (upstream.ok) {
    try {
      const data = JSON.parse(text);
      const walletPubkey = req.body.walletPubkey as string;
      // Jupiter JWTs are valid for 24h; cache for 23h
      if (data.token && walletPubkey) {
        setToken(walletPubkey, data.token, 23 * 60 * 60 * 1000);
      }
    } catch { /* ignore parse errors */ }
  }
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
});

// All other trigger routes — attach cached JWT if available
function withJwt(req: Request, res: Response, jupPath: string) {
  const walletPubkey = (req.query['walletPubkey'] ?? req.body?.walletPubkey) as string | undefined;
  const jwt = walletPubkey ? getToken(walletPubkey) : null;
  const extraHeaders: Record<string, string> = jwt ? { Authorization: `Bearer ${jwt}` } : {};
  return proxyToJupiter(req, res, jupPath, extraHeaders);
}

router.get('/vault', (req, res) => withJwt(req, res, '/trigger/v2/vault'));
router.get('/vault/register', (req, res) => withJwt(req, res, '/trigger/v2/vault/register'));
router.post('/deposit/craft', (req, res) => withJwt(req, res, '/trigger/v2/deposit/craft'));
router.post('/orders/price', (req, res) => withJwt(req, res, '/trigger/v2/orders/price'));
router.patch('/orders/price', (req, res) => withJwt(req, res, '/trigger/v2/orders/price'));
router.post('/orders/price/cancel/:orderId', (req, res) => withJwt(req, res, `/trigger/v2/orders/price/cancel/${req.params['orderId']}`));
router.post('/orders/price/confirm-cancel/:orderId', (req, res) => withJwt(req, res, `/trigger/v2/orders/price/confirm-cancel/${req.params['orderId']}`));
router.get('/orders/history', (req, res) => withJwt(req, res, '/trigger/v2/orders/history'));

export default router;
