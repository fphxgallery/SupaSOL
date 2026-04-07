import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();

// ── Jupiter current price ──────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  const url = new URL('https://api.jup.ag/price/v3');
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }
  const upstream = await fetch(url.toString(), {
    headers: { 'x-api-key': config.jupiterApiKey },
  });
  const text = await upstream.text();
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
});

// ── Historical OHLCV via CoinGecko (free, no key) ─────────────────────────

// Solana mint → CoinGecko coin ID
const COINGECKO_IDS: Record<string, string> = {
  So11111111111111111111111111111111111111112:  'solana',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'usd-coin',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'tether',
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN:  'jupiter-exchange-solana',
};

// Interval → how many days to request from CoinGecko
const INTERVAL_DAYS: Record<string, number> = {
  '1H': 1,
  '4H': 1,
  '1D': 1,
  '1W': 7,
  '1M': 30,
};

// Interval → how many seconds of data to keep (for slicing sub-day views)
const INTERVAL_SECONDS: Record<string, number> = {
  '1H': 3600,
  '4H': 4 * 3600,
  '1D': 86400,
  '1W': 7 * 86400,
  '1M': 30 * 86400,
};

interface PricePoint { time: number; value: number }
interface CacheEntry  { data: { data: PricePoint[] }; expiresAt: number }

const historyCache = new Map<string, CacheEntry>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

router.get('/history', async (req: Request, res: Response) => {
  try {
    const mint     = String(req.query['mint'] ?? '');
    const interval = String(req.query['interval'] ?? '1D');

    const coinId = COINGECKO_IDS[mint];
    if (!coinId) {
      res.status(400).json({ error: `No CoinGecko ID for mint: ${mint}` });
      return;
    }

    // Serve from cache if fresh
    const cacheKey = `${mint}:${interval}`;
    const cached   = historyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    const days = INTERVAL_DAYS[interval] ?? 1;
    const url  = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart` +
                 `?vs_currency=usd&days=${days}&precision=6`;

    const upstream = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!upstream.ok) {
      // Pass CoinGecko status through (e.g. 429 rate limit)
      const text = await upstream.text();
      res.status(upstream.status).json({ error: text });
      return;
    }

    const json = await upstream.json() as { prices: [number, number][] };

    // Convert [ms, price] → { time (unix s), value }
    const cutoff = Date.now() / 1000 - (INTERVAL_SECONDS[interval] ?? 86400);
    const points: PricePoint[] = json.prices
      .map(([ts, price]) => ({ time: Math.floor(ts / 1000), value: price }))
      .filter((p) => p.time >= cutoff);

    const result = { data: points };
    historyCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });
    res.json(result);
  } catch (err) {
    console.error('[price/history]', err);
    res.status(500).json({ error: 'Failed to fetch price history' });
  }
});

export default router;
