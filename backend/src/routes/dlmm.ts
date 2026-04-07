import { Router, Request, Response } from 'express';

const router = Router();
const METEORA_API = 'https://dlmm.datapi.meteora.ag';

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

// GET /api/dlmm/pairs — paginated pool list
// Accepts: page (1-based), page_size, query (search), sort_by (e.g. "volume_24h:desc")
router.get('/pairs', (req, res) => proxyToMeteora(req, res, '/pools'));

// GET /api/dlmm/pair/:address — single pool metadata
router.get('/pair/:address', (req, res) =>
  proxyToMeteora(req, res, `/pools/${req.params.address}`)
);

export default router;
