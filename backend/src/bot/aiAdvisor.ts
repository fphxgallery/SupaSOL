import { chatCompletion, isOpenAIConfigured, OpenAIError } from '../lib/openaiApi';
import type { TrendingToken, IntervalStats } from '../lib/jupiterApi';
import type { AiModel, ClosedPosition } from './types';

const MAX_HISTORY_ENTRIES = 5;
const MAX_REJECTION_ENTRIES = 3;

export interface AiRejection {
  action: AiAction;
  confidence: number;
  reason: string;
  time: number;
}

const rejections = new Map<string, AiRejection[]>();

export function recordRejection(mint: string, r: Omit<AiRejection, 'time'>): void {
  const entry: AiRejection = { ...r, time: Date.now() };
  const prev = rejections.get(mint) ?? [];
  rejections.set(mint, [entry, ...prev].slice(0, MAX_REJECTION_ENTRIES));
}

export function getRejections(mint: string): AiRejection[] {
  return rejections.get(mint) ?? [];
}

function ageStr(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

function formatRejections(list: AiRejection[] | undefined): string | null {
  if (!list || list.length === 0) return null;
  const now = Date.now();
  const lines = list.map((r) => `- ${r.action} @${r.confidence}% — "${r.reason}" (${ageStr(now - r.time)})`);
  return `Prior AI rejections on this mint (most recent first):\n${lines.join('\n')}`;
}

function formatHistory(history: ClosedPosition[] | undefined): string | null {
  if (!history || history.length === 0) return null;
  const now = Date.now();
  const lines = history.slice(0, MAX_HISTORY_ENTRIES).map((p) => {
    const ageMin = Math.round((now - p.exitTime) / 60_000);
    const held = Math.round((p.exitTime - p.entryTime) / 60_000);
    const ageStr = ageMin < 60 ? `${ageMin}m ago` : ageMin < 1440 ? `${Math.round(ageMin / 60)}h ago` : `${Math.round(ageMin / 1440)}d ago`;
    return `- ${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct.toFixed(1)}% (held ${held}m, exit=${p.exitReason}, ${ageStr})`;
  });
  return `Prior bot trades on this mint (most recent first):\n${lines.join('\n')}`;
}

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
  history?: ClosedPosition[];
  rejections?: AiRejection[];
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
  trailingStopPct: number;
  takeProfitPct: number;
  stats5m?: IntervalStats;
  stats1h?: IntervalStats;
  history?: ClosedPosition[];
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
  rejections.clear();
  rate.windowStart = Date.now();
  rate.count = 0;
}

function cacheKey(ctx: AdvisorContext): string {
  const histLen = ctx.history?.length ?? 0;
  if (ctx.kind === 'entry') {
    const rejLen = ctx.rejections?.length ?? 0;
    return `entry:${ctx.token.address}:h${histLen}:r${rejLen}`;
  }
  return `exit:${ctx.mint}:${Math.round(ctx.pnlPct)}:h${histLen}`;
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
  const system = `You are a crypto trading assistant for a Solana memecoin bot. You evaluate trade signals and respond ONLY with strict JSON: {"action":"buy|hold|sell|skip","confidence":0-100,"reason":"<=120 chars"}. Calibrate confidence honestly: 90-100 = multiple independent signals strongly align (3+ timeframes agree, or volume+holders+price all confirm same direction); 80-89 = 2 strong signals agree with no conflict; 70-79 = single clear signal or mixed evidence; 50-69 = weak/ambiguous; <50 = near coin-flip. Do NOT cluster around 70-80 — if your reason cites multiple confirming signals or multiple timeframes, confidence should be 85+. Memecoins are momentum plays — strong volume, rising holders, positive net buyers, and organic buy pressure are buy signals. Don't require perfection; weigh signals on balance. Skip only on clear red flags (dumping liquidity, sell-dominated volume, collapsing holders). If prior bot trades on this mint are provided, factor them in: repeated losses suggest caution; recent profitable exits on re-entry are a positive signal but don't guarantee repeat. If prior AI rejections on this mint are provided, check whether the flagged concerns are still present in current stats — if same red flags persist, keep skipping; if conditions materially improved, a fresh look is OK.

For EXIT decisions, default to HOLD. A trailing stop (auto-sells on drop from peak) and a take-profit target are already enforced outside your decision — you do NOT need to preempt them. Recommend SELL only on clear sustained reversal: negative 1h price change combined with negative holder change, collapsing liquidity, or sell-dominated organic volume across BOTH 5m AND 1h. Ignore single-candle 5m noise. Small green P&L is not a sell signal — let winners run toward the take-profit target. Only sell early if momentum is clearly breaking down at the higher timeframe.`;

  const historyBlock = formatHistory(ctx.history);

  if (ctx.kind === 'entry') {
    const t = ctx.token;
    const parts = [
      `Evaluate BUY signal for ${t.symbol} (${t.name}).`,
      `mcap: $${t.mcap ?? 'unknown'}`,
      `organicScore: ${t.organicScore ?? 'unknown'}/100`,
      formatStats('5m', t.stats['5m']),
      formatStats('1h', t.stats['1h']),
      formatStats('6h', t.stats['6h']),
      formatStats('24h', t.stats['24h']),
    ];
    if (historyBlock) parts.push(historyBlock);
    const rejectionBlock = formatRejections(ctx.rejections);
    if (rejectionBlock) parts.push(rejectionBlock);
    parts.push('Answer buy or skip with confidence.');
    return { system, user: parts.join('\n') };
  }

  const drawdownFromPeak = ctx.peakPrice > 0 ? ((ctx.peakPrice - ctx.currentPrice) / ctx.peakPrice) * 100 : 0;
  const parts = [
    `Evaluate EXIT for open position ${ctx.symbol}. Default action is HOLD unless clear reversal.`,
    `entryPrice: ${ctx.entryPrice}`,
    `currentPrice: ${ctx.currentPrice}`,
    `peakPrice: ${ctx.peakPrice}`,
    `drawdownFromPeak: ${drawdownFromPeak.toFixed(2)}%`,
    `pnlPct: ${ctx.pnlPct.toFixed(2)}%`,
    `heldMinutes: ${ctx.heldMinutes.toFixed(1)}`,
    `trailingStopPct: ${ctx.trailingStopPct}% (auto-sells if drawdown from peak hits this)`,
    `takeProfitPct: ${ctx.takeProfitPct}% (auto-sells at this gain)`,
    formatStats('5m', ctx.stats5m),
    formatStats('1h', ctx.stats1h),
  ];
  if (historyBlock) parts.push(historyBlock);
  parts.push('Recommend SELL only on clear sustained reversal across 5m AND 1h. Otherwise HOLD.');
  return { system, user: parts.join('\n') };
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
