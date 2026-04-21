import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();
const JUP_BASE = 'https://api.jup.ag';

// Icon cache: mint → { icon, expires }
const iconCache = new Map<string, { icon: string | null; expires: number }>();
const ICON_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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

// GET /api/tokens/icon/:mint — cached icon lookup, never 429s the client
router.get('/icon/:mint', async (req, res) => {
  const { mint } = req.params;
  const cached = iconCache.get(mint);
  if (cached && cached.expires > Date.now()) {
    return res.json({ icon: cached.icon });
  }
  try {
    const upstream = await fetch(`${JUP_BASE}/tokens/v2/search?query=${mint}`, {
      headers: { 'x-api-key': config.jupiterApiKey },
    });
    let icon: string | null = null;
    if (upstream.ok) {
      const data = await upstream.json();
      icon = (Array.isArray(data) ? data[0]?.icon : data?.icon) ?? null;
    }
    iconCache.set(mint, { icon, expires: Date.now() + ICON_TTL_MS });
    res.json({ icon });
  } catch {
    res.json({ icon: null });
  }
});

router.get('/search', (req, res) => proxyToJupiter(req, res, '/tokens/v2/search'));
router.get('/tag', (req, res) => proxyToJupiter(req, res, '/tokens/v2/tag'));
router.get('/recent', (req, res) => proxyToJupiter(req, res, '/tokens/v2/recent'));
router.get('/:category/:interval', (req, res) =>
  proxyToJupiter(req, res, `/tokens/v2/${req.params['category']}/${req.params['interval']}`)
);

export default router;
