import { Router, Request, Response } from 'express';

const router = Router();

// ─── DexScreener types ────────────────────────────────────────────────────────

interface DexPair {
  chainId: string;
  pairAddress: string;
  liquidity?: { usd?: number };
}

interface DexBar {
  t: number; o: number; h: number; l: number; c: number;
}

// ─── Resolution mapping ───────────────────────────────────────────────────────

const DS_RESOLUTION: Record<string, string> = {
  '1H': '60',
  '4H': '240',
  '1D': '1D',
  '1W': '1W',
  '1M': '1W', // DexScreener has no monthly resolution
};

// ─── Cache ────────────────────────────────────────────────────────────────────

interface OHLCVPoint { time: number; open: number; high: number; low: number; close: number }
interface CacheEntry  { data: OHLCVPoint[]; expiresAt: number }

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// ─── Route ────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const mint     = String(req.query['mint'] ?? '').trim();
    const interval = String(req.query['interval'] ?? '1D');

    if (!mint) {
      res.status(400).json({ error: 'mint is required' });
      return;
    }

    // Serve from cache if fresh
    const cacheKey = `${mint}:${interval}`;
    const cached   = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    // Step 1 — find the best-liquidity Solana pair for this token
    const tokenRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { Accept: 'application/json' },
    });
    if (!tokenRes.ok) {
      res.status(502).json({ error: `DexScreener tokens: ${tokenRes.status}` });
      return;
    }
    const tokenJson = await tokenRes.json() as { pairs?: DexPair[] };

    const solanaPairs = (tokenJson.pairs ?? []).filter((p) => p.chainId === 'solana');
    if (solanaPairs.length === 0) {
      res.status(404).json({ error: 'No Solana pairs found for this token' });
      return;
    }
    solanaPairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const { pairAddress } = solanaPairs[0];

    // Step 2 — fetch OHLCV bars for that pair
    const resolution = DS_RESOLUTION[interval] ?? '1D';
    const cb         = Math.floor(Date.now() / 1000);
    const chartRes   = await fetch(
      `https://io.dexscreener.com/dex/chart/amm/v3/solana/${pairAddress}?res=${resolution}&cb=${cb}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://dexscreener.com/',
          'Origin': 'https://dexscreener.com',
        },
      },
    );
    if (!chartRes.ok) {
      res.status(502).json({ error: `DexScreener chart: ${chartRes.status}` });
      return;
    }
    const chartJson = await chartRes.json() as { bars?: DexBar[] };

    const bars = chartJson.bars ?? [];
    if (bars.length === 0) {
      res.status(404).json({ error: 'No chart data available' });
      return;
    }

    const data: OHLCVPoint[] = bars
      .map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }))
      .sort((a, b) => a.time - b.time);

    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL });
    res.json(data);
  } catch (err) {
    console.error('[ohlcv]', err);
    res.status(500).json({ error: 'Failed to fetch OHLCV data' });
  }
});

export default router;
