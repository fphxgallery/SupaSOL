import { Router, Request, Response } from 'express';
import { config } from '../config';
import {
  isBase58Address,
  requireBase58Param,
  requireWhitelistParam,
  JUP_TOKEN_CATEGORIES,
  JUP_TOKEN_INTERVALS,
} from '../lib/validators';

const router = Router();
const JUP_BASE = 'https://api.jup.ag';

// Icon cache: mint → { icon, expires }. LRU-bounded to prevent unbounded growth.
const iconCache = new Map<string, { icon: string | null; expires: number }>();
const ICON_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const ICON_CACHE_MAX = 5000;

function iconCacheSet(mint: string, icon: string | null) {
  if (iconCache.has(mint)) iconCache.delete(mint);
  iconCache.set(mint, { icon, expires: Date.now() + ICON_TTL_MS });
  while (iconCache.size > ICON_CACHE_MAX) {
    const oldest = iconCache.keys().next().value;
    if (oldest === undefined) break;
    iconCache.delete(oldest);
  }
}

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
  const mint = req.params['mint'];
  if (!isBase58Address(mint)) {
    return res.status(400).json({ error: 'Invalid mint' });
  }
  const cached = iconCache.get(mint);
  if (cached && cached.expires > Date.now()) {
    return res.json({ icon: cached.icon });
  }
  try {
    const upstream = await fetch(`${JUP_BASE}/tokens/v2/search?query=${encodeURIComponent(mint)}`, {
      headers: { 'x-api-key': config.jupiterApiKey },
    });
    let icon: string | null = null;
    if (upstream.ok) {
      const data = await upstream.json();
      icon = (Array.isArray(data) ? data[0]?.icon : data?.icon) ?? null;
    }
    iconCacheSet(mint, icon);
    res.json({ icon });
  } catch {
    res.json({ icon: null });
  }
});

router.get('/search', (req, res) => proxyToJupiter(req, res, '/tokens/v2/search'));
router.get('/tag', (req, res) => proxyToJupiter(req, res, '/tokens/v2/tag'));
router.get('/recent', (req, res) => proxyToJupiter(req, res, '/tokens/v2/recent'));
router.get('/:category/:interval', (req, res) => {
  const category = requireWhitelistParam(req, res, 'category', JUP_TOKEN_CATEGORIES);
  if (!category) return;
  const interval = requireWhitelistParam(req, res, 'interval', JUP_TOKEN_INTERVALS);
  if (!interval) return;
  proxyToJupiter(req, res, `/tokens/v2/${category}/${interval}`);
});

export default router;
