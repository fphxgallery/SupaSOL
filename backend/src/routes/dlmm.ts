import { Router, Request, Response } from 'express';

const router = Router();
const METEORA_API = 'https://dlmm-api.meteora.ag';

async function proxyToMeteora(req: Request, res: Response, meteoraPath: string) {
  const url = new URL(`${METEORA_API}${meteoraPath}`);
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }

  const upstream = await fetch(url.toString(), {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
    ...(req.method !== 'GET' && req.method !== 'HEAD'
      ? { body: JSON.stringify(req.body) }
      : {}),
  });

  const text = await upstream.text();
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
}

// GET /api/dlmm/pairs?page=0&limit=10&search_term=SOL&sort_key=feetvl&order_by=desc
router.get('/pairs', (req, res) => proxyToMeteora(req, res, '/pair/all_with_pagination'));

// GET /api/dlmm/pair/:address
router.get('/pair/:address', (req, res) =>
  proxyToMeteora(req, res, `/pair/${req.params.address}`)
);

// GET /api/dlmm/pairs/by_groups — popular/featured pools
router.get('/pairs/by_groups', (req, res) =>
  proxyToMeteora(req, res, '/pair/all_by_groups')
);

export default router;
