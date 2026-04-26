import type { TrendingToken } from '../lib/jupiterApi';
import type { ClosedPosition } from './types';

const MIN_MCAP = 200_000;
const MIN_ORGANIC_SCORE = 70;
const MIN_TOKEN_AGE_MS = 48 * 3600_000;
const TOP_N = 25;
const SNAPSHOT_TTL_MS = 15 * 60_000;
const PERF_WINDOW = 20;
const MIN_SAMPLE_MARKET = 5;
const MIN_SAMPLE_PERF = 3;

export interface MarketSentimentSnapshot {
  ts: number;
  sampleSize: number;
  avg6hPriceChange: number;
  avg24hPriceChange: number;
  pctPositiveNetBuyers6h: number;
  avgOrganicScore: number;
  dayUtc: string;
  weekend: boolean;
}

export interface BotPerformanceSnapshot {
  closedCount: number;
  wins: number;
  losses: number;
  winRatePct: number;
  avgPnlPct: number;
  avgHeldMinutes: number;
  streak: { sign: 'win' | 'loss' | 'flat'; count: number };
  topExitReasons: Array<{ reason: string; count: number }>;
}

let latestMarket: MarketSentimentSnapshot | null = null;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function computeMarketSentiment(tokens: TrendingToken[]): MarketSentimentSnapshot | null {
  const now = Date.now();
  const filtered = tokens
    .filter((t) =>
      (t.mcap ?? 0) >= MIN_MCAP &&
      (t.organicScore ?? 0) >= MIN_ORGANIC_SCORE &&
      typeof t.createdAt === 'number' &&
      now - t.createdAt >= MIN_TOKEN_AGE_MS,
    )
    .sort((a, b) => (b.organicScore ?? 0) - (a.organicScore ?? 0))
    .slice(0, TOP_N);

  if (filtered.length < MIN_SAMPLE_MARKET) {
    latestMarket = null;
    return null;
  }

  let sum6h = 0, n6h = 0;
  let sum24h = 0, n24h = 0;
  let posNetBuyers6h = 0, totalNetBuyers6h = 0;
  let sumOrganic = 0;

  for (const t of filtered) {
    const s6 = t.stats['6h'];
    const s24 = t.stats['24h'];
    if (typeof s6?.priceChange === 'number') { sum6h += s6.priceChange; n6h++; }
    if (typeof s24?.priceChange === 'number') { sum24h += s24.priceChange; n24h++; }
    if (typeof s6?.numNetBuyers === 'number') {
      totalNetBuyers6h++;
      if (s6.numNetBuyers > 0) posNetBuyers6h++;
    }
    sumOrganic += t.organicScore ?? 0;
  }

  const dow = new Date(now).getUTCDay();

  const snap: MarketSentimentSnapshot = {
    ts: Date.now(),
    sampleSize: filtered.length,
    avg6hPriceChange: n6h > 0 ? sum6h / n6h : 0,
    avg24hPriceChange: n24h > 0 ? sum24h / n24h : 0,
    pctPositiveNetBuyers6h: totalNetBuyers6h > 0 ? (posNetBuyers6h / totalNetBuyers6h) * 100 : 0,
    avgOrganicScore: sumOrganic / filtered.length,
    dayUtc: DAY_NAMES[dow],
    weekend: dow === 0 || dow === 6,
  };
  latestMarket = snap;
  return snap;
}

export function getMarketSentiment(): MarketSentimentSnapshot | null {
  if (!latestMarket) return null;
  if (Date.now() - latestMarket.ts > SNAPSHOT_TTL_MS) return null;
  return latestMarket;
}

export function computeBotPerformance(closed: ClosedPosition[]): BotPerformanceSnapshot | null {
  if (closed.length < MIN_SAMPLE_PERF) return null;
  const recent = [...closed].sort((a, b) => b.exitTime - a.exitTime).slice(0, PERF_WINDOW);

  let wins = 0, losses = 0, sumPnl = 0, sumHeld = 0;
  const reasonCounts = new Map<string, number>();
  for (const p of recent) {
    if (p.pnlPct > 0) wins++;
    else if (p.pnlPct < 0) losses++;
    sumPnl += p.pnlPct;
    sumHeld += (p.exitTime - p.entryTime) / 60_000;
    reasonCounts.set(p.exitReason, (reasonCounts.get(p.exitReason) ?? 0) + 1);
  }

  let streakCount = 0;
  let streakSign: 'win' | 'loss' | 'flat' = 'flat';
  if (recent.length > 0) {
    const first = recent[0];
    streakSign = first.pnlPct > 0 ? 'win' : first.pnlPct < 0 ? 'loss' : 'flat';
    for (const p of recent) {
      const sign = p.pnlPct > 0 ? 'win' : p.pnlPct < 0 ? 'loss' : 'flat';
      if (sign === streakSign) streakCount++;
      else break;
    }
  }

  const topExitReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => ({ reason, count }));

  return {
    closedCount: recent.length,
    wins,
    losses,
    winRatePct: recent.length > 0 ? (wins / recent.length) * 100 : 0,
    avgPnlPct: sumPnl / recent.length,
    avgHeldMinutes: sumHeld / recent.length,
    streak: { sign: streakSign, count: streakCount },
    topExitReasons,
  };
}

export function formatMarketSentimentBlock(snap: MarketSentimentSnapshot): string {
  const ageMin = Math.max(0, Math.round((Date.now() - snap.ts) / 60_000));
  const sign6 = snap.avg6hPriceChange >= 0 ? '+' : '';
  const sign24 = snap.avg24hPriceChange >= 0 ? '+' : '';
  return [
    `Market context (top ${TOP_N} trending, mcap>$${MIN_MCAP / 1000}k, organicScore≥${MIN_ORGANIC_SCORE}, age≥${MIN_TOKEN_AGE_MS / 3600_000}h, n=${snap.sampleSize}, age=${ageMin}m):`,
    `- avg 6h price: ${sign6}${snap.avg6hPriceChange.toFixed(2)}% | avg 24h price: ${sign24}${snap.avg24hPriceChange.toFixed(2)}%`,
    `- 6h net-buyer breadth: ${snap.pctPositiveNetBuyers6h.toFixed(0)}% positive | avg organicScore: ${snap.avgOrganicScore.toFixed(0)}`,
    `- day: ${snap.dayUtc} (UTC) | weekend: ${snap.weekend ? 'yes' : 'no'}`,
  ].join('\n');
}

export function formatBotPerformanceBlock(perf: BotPerformanceSnapshot): string {
  const reasons = perf.topExitReasons.map((r) => `${r.reason} (${r.count})`).join(', ') || 'n/a';
  const streakStr = perf.streak.count >= 2 ? `${perf.streak.count} ${perf.streak.sign === 'win' ? 'wins' : perf.streak.sign === 'loss' ? 'losses' : 'flat'} in a row` : 'no streak';
  const pnlSign = perf.avgPnlPct >= 0 ? '+' : '';
  return [
    `Bot recent performance (last ${perf.closedCount} closed):`,
    `- W/L: ${perf.wins}/${perf.losses} (${perf.winRatePct.toFixed(0)}% win rate) | avg pnl: ${pnlSign}${perf.avgPnlPct.toFixed(1)}% | avg held: ${perf.avgHeldMinutes.toFixed(0)}m`,
    `- streak: ${streakStr} | top exit reasons: ${reasons}`,
  ].join('\n');
}
