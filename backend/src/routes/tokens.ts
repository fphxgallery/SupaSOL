import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();
const JUP_BASE = 'https://api.jup.ag';

async function proxyToJupiter(req: Request, res: Response, jupPath: string) {
  const url = new URL(`${JUP_BASE}${jupPath}`);
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }
  const upstream = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'x-api-key': config.jupiterApiKey },
  });
  const text = await upstream.text();
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
}

router.get('/search', (req, res) => proxyToJupiter(req, res, '/tokens/v2/search'));
router.get('/tag', (req, res) => proxyToJupiter(req, res, '/tokens/v2/tag'));
router.get('/recent', (req, res) => proxyToJupiter(req, res, '/tokens/v2/recent'));
router.get('/:category/:interval', (req, res) =>
  proxyToJupiter(req, res, `/tokens/v2/${req.params['category']}/${req.params['interval']}`)
);

export default router;
