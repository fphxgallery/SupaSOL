import { Router, Request, Response } from 'express';
import { config } from '../config';
import { requireBase58Param } from '../lib/validators';

const router = Router();
const JUP_BASE = 'https://api.jup.ag';

async function proxyToJupiter(req: Request, res: Response, jupPath: string) {
  const url = new URL(`${JUP_BASE}${jupPath}`);
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }
  const upstream = await fetch(url.toString(), {
    headers: { 'x-api-key': config.jupiterApiKey },
  });
  const text = await upstream.text();
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
}

router.get('/positions/:address', (req, res) => {
  const address = requireBase58Param(req, res, 'address');
  if (!address) return;
  proxyToJupiter(req, res, `/portfolio/v1/positions/${address}`);
});
router.get('/platforms', (req, res) => proxyToJupiter(req, res, '/portfolio/v1/platforms'));
router.get('/staked-jup/:address', (req, res) => {
  const address = requireBase58Param(req, res, 'address');
  if (!address) return;
  proxyToJupiter(req, res, `/portfolio/v1/staked-jup/${address}`);
});

export default router;
