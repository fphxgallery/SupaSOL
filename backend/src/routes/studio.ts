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

// Multipart relay for submit endpoint — forward raw body with original Content-Type
async function proxyMultipart(req: Request, res: Response) {
  const url = new URL(`${JUP_BASE}/studio/v1/dbc-pool/submit`);
  const contentType = req.headers['content-type'] ?? '';
  const upstream = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'x-api-key': config.jupiterApiKey,
      'Content-Type': contentType,
    },
    body: req as unknown as BodyInit,
    // @ts-expect-error Node.js fetch duplex option
    duplex: 'half',
  });
  const text = await upstream.text();
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
}

router.post('/dbc-pool/create-tx', (req, res) => proxyToJupiter(req, res, '/studio/v1/dbc-pool/create-tx'));
router.post('/dbc-pool/submit', proxyMultipart);
router.get('/dbc-pool/addresses/:mint', (req, res) =>
  proxyToJupiter(req, res, `/studio/v1/dbc-pool/addresses/${req.params['mint']}`)
);
router.post('/dbc/fee', (req, res) => proxyToJupiter(req, res, '/studio/v1/dbc/fee'));
router.post('/dbc/fee/create-tx', (req, res) => proxyToJupiter(req, res, '/studio/v1/dbc/fee/create-tx'));

export default router;
