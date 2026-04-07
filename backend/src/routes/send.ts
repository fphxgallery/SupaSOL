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

router.post('/craft-send', (req, res) => proxyToJupiter(req, res, '/send/v1/craft-send'));
router.post('/craft-clawback', (req, res) => proxyToJupiter(req, res, '/send/v1/craft-clawback'));
router.get('/pending-invites', (req, res) => proxyToJupiter(req, res, '/send/v1/pending-invites'));
router.get('/invite-history', (req, res) => proxyToJupiter(req, res, '/send/v1/invite-history'));

export default router;
