import { chatCompletion, isOpenAIConfigured, OpenAIError } from '../lib/openaiApi';
import type { TrendingToken, IntervalStats } from '../lib/jupiterApi';
import type { AiModel } from './types';

function fmt(n: number | undefined, digits = 2): string {
  return typeof n === 'number' ? n.toFixed(digits) : '?';
}

function formatStats(label: string, s: IntervalStats | undefined): string {
  if (!s) return `${label}: (no data)`;
  return `${label}: priceChange=${fmt(s.priceChange)}% holderChange=${fmt(s.holderChange)}% liquidityChange=${fmt(s.liquidityChange)}% volumeChange=${fmt(s.volumeChange)}% buyVolume=${fmt(s.buyVolume, 0)} sellVolume=${fmt(s.sellVolume, 0)} buyOrganicVolume=${fmt(s.buyOrganicVolume, 0)} sellOrganicVolume=${fmt(s.sellOrganicVolume, 0)} numBuys=${s.numBuys ?? '?'} numSells=${s.numSells ?? '?'} numTraders=${s.numTraders ?? '?'} numOrganicBuyers=${s.numOrganicBuyers ?? '?'} numNetBuyers=${s.numNetBuyers ?? '?'}`;
}

export type AiAction = 'buy' | 'hold' | 'sell' | 'skip';

export interface AiDecision {
  action: AiAction;
  confidence: number;
  reason: string;
  tokensUsed: number;
  cached: boolean;
}

export interface EntryContext {
  kind: 'entry';
  token: TrendingToken;
}

export interface ExitContext {
  kind: 'exit';
  mint: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  peakPrice: number;
  pnlPct: number;
  heldMinutes: number;
  stats5m?: IntervalStats;
  stats1h?: IntervalStats;
}

export type AdvisorContext = EntryContext | ExitContext;

interface CacheEntry {
  decision: AiDecision;
  expiresAt: number;
}

interface RateState {
  windowStart: number;
  count: number;
}

const cache = new Map<string, CacheEntry>();
const rate: RateState = { windowStart: Date.now(), count: 0 };

export function resetAdvisorState(): void {
  cache.clear();
  rate.windowStart = Date.now();
  rate.count = 0;
}

function cacheKey(ctx: AdvisorContext): string {
  if (ctx.kind === 'entry') return `entry:${ctx.token.address}`;
  return `exit:${ctx.mint}:${Math.round(ctx.pnlPct)}`;
}

function checkRate(maxPerHour: number): boolean {
  const now = Date.now();
  if (now - rate.windowStart >= 3_600_000) {
    rate.windowStart = now;
    rate.count = 0;
  }
  return rate.count < maxPerHour;
}

function buildPrompt(ctx: AdvisorContext): { system: string; user: string } {
  const system = `You are a crypto trading assistant for a Solana memecoin bot. You evaluate trade signals and respond ONLY with strict JSON: {"action":"buy|hold|sell|skip","confidence":0-100,"reason":"<=120 chars"}. Memecoins are momentum plays — strong volume, rising holders, positive net buyers, and organic buy pressure are buy signals. Don't require perfection; weigh signals on balance. Skip only on clear red flags (dumping liquidity, sell-dominated volume, collapsing holders).`;

  if (ctx.kind === 'entry') {
    const t = ctx.token;
    const user = `Evaluate BUY signal for ${t.symbol} (${t.name}).
mcap: $${t.mcap ?? 'unknown'}
organicScore: ${t.organicScore ?? 'unknown'}/100
${formatStats('5m', t.stats['5m'])}
${formatStats('1h', t.stats['1h'])}
${formatStats('6h', t.stats['6h'])}
${formatStats('24h', t.stats['24h'])}
Answer buy or skip with confidence.`;
    return { system, user };
  }

  const user = `Evaluate EXIT for open position ${ctx.symbol}.
entryPrice: ${ctx.entryPrice}
currentPrice: ${ctx.currentPrice}
peakPrice: ${ctx.peakPrice}
pnlPct: ${ctx.pnlPct.toFixed(2)}%
heldMinutes: ${ctx.heldMinutes.toFixed(1)}
${formatStats('5m', ctx.stats5m)}
${formatStats('1h', ctx.stats1h)}
Answer sell or hold with confidence.`;
  return { system, user };
}

function parseDecision(content: string): { action: AiAction; confidence: number; reason: string } | null {
  try {
    const parsed = JSON.parse(content) as { action?: string; confidence?: number; reason?: string };
    const action = parsed.action;
    if (action !== 'buy' && action !== 'hold' && action !== 'sell' && action !== 'skip') return null;
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(100, parsed.confidence))
      : 0;
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '';
    return { action, confidence, reason };
  } catch {
    return null;
  }
}

export interface AdvisorOptions {
  model: AiModel;
  maxCallsPerHour: number;
  cacheMinutes: number;
}

export async function getTradeDecision(
  ctx: AdvisorContext,
  opts: AdvisorOptions,
): Promise<AiDecision | { error: string }> {
  if (!isOpenAIConfigured()) return { error: 'openai-not-configured' };

  const key = cacheKey(ctx);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return { ...hit.decision, cached: true };
  }

  if (!checkRate(opts.maxCallsPerHour)) {
    return { error: 'rate-limited' };
  }

  const { system, user } = buildPrompt(ctx);

  try {
    rate.count += 1;
    const resp = await chatCompletion({
      model: opts.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      maxTokens: 200,
      jsonMode: true,
      timeoutMs: 8_000,
    });

    const parsed = parseDecision(resp.content);
    if (!parsed) return { error: 'parse-failed' };

    const decision: AiDecision = {
      ...parsed,
      tokensUsed: resp.totalTokens,
      cached: false,
    };

    if (opts.cacheMinutes > 0) {
      cache.set(key, { decision, expiresAt: now + opts.cacheMinutes * 60_000 });
    }

    return decision;
  } catch (err) {
    const msg = err instanceof OpenAIError ? err.message : 'unknown-error';
    return { error: msg };
  }
}
