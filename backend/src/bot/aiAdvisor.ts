import { chatCompletion, isOpenAIConfigured, OpenAIError } from '../lib/openaiApi';
import type { TrendingToken, IntervalStats } from '../lib/jupiterApi';
import type { AiModel, ClosedPosition } from './types';

const MAX_HISTORY_ENTRIES = 5;
const MAX_REJECTION_ENTRIES = 3;
const MAX_DECISION_SNAPSHOTS = 20;
const MAX_DECISION_LOG = 200;

export interface AiRejection {
  action: AiAction;
  confidence: number;
  reason: string;
  time: number;
}

export interface AiDecisionSnapshot {
  ts: number;
  action: AiAction;
  confidence: number;
  pnlPct: number;
  heldMinutes: number;
  score5m: number;
  score1h: number;
  composite: number;
}

const rejections = new Map<string, AiRejection[]>();
const decisionHistory = new Map<string, AiDecisionSnapshot[]>();

export interface AiDecisionLogEntry {
  id: string;
  ts: number;
  kind: 'entry' | 'exit';
  mint: string;
  symbol: string;
  action: AiAction;
  confidence: number;
  reason: string;
  cached: boolean;
  tokensUsed: number;
  mode?: string;
  outcome: 'buy' | 'veto' | 'no-confirm' | 'advisory' | 'sell' | 'hold' | 'unavailable';
  gate?: number;
  composite?: number;
  pnlPct?: number;
  heldMinutes?: number;
  error?: string;
}

const decisionLog: AiDecisionLogEntry[] = [];

export function recordDecisionLog(entry: Omit<AiDecisionLogEntry, 'id' | 'ts'>): void {
  const rec: AiDecisionLogEntry = { ...entry, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now() };
  decisionLog.unshift(rec);
  if (decisionLog.length > MAX_DECISION_LOG) decisionLog.length = MAX_DECISION_LOG;
}

export function getDecisionLog(): AiDecisionLogEntry[] {
  return decisionLog;
}

export function clearDecisionLog(): void {
  decisionLog.length = 0;
}

const SIGNAL_WEIGHTS = {
  priceChange: 1.0,
  holderChange: 1.2,
  netBuyers: 1.2,
  organicRatio: 1.0,
  liquidityChange: 0.8,
  volumeChange: 0.5,
  totalRatio: 0.4,
  countRatio: 0.3,
} as const;
const WEIGHT_SUM = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);

function clipNorm(x: number | undefined, lim: number): number {
  const v = typeof x === 'number' ? x : 0;
  return Math.max(-lim, Math.min(lim, v)) / lim;
}
function sideRatio(b: number | undefined, s: number | undefined): number {
  const bb = b ?? 0;
  const ss = s ?? 0;
  const tot = bb + ss;
  return tot > 0 ? (bb - ss) / tot : 0;
}

export function scoreInterval(s: IntervalStats | undefined): number {
  if (!s) return 0;
  const sum =
    SIGNAL_WEIGHTS.priceChange * clipNorm(s.priceChange, 50) +
    SIGNAL_WEIGHTS.holderChange * clipNorm(s.holderChange, 50) +
    SIGNAL_WEIGHTS.netBuyers * clipNorm(s.numNetBuyers, 100) +
    SIGNAL_WEIGHTS.organicRatio * sideRatio(s.buyOrganicVolume, s.sellOrganicVolume) +
    SIGNAL_WEIGHTS.liquidityChange * clipNorm(s.liquidityChange, 50) +
    SIGNAL_WEIGHTS.volumeChange * clipNorm(s.volumeChange, 50) +
    SIGNAL_WEIGHTS.totalRatio * sideRatio(s.buyVolume, s.sellVolume) +
    SIGNAL_WEIGHTS.countRatio * sideRatio(s.numBuys, s.numSells);
  return sum / WEIGHT_SUM;
}

export function compositeScore(s5m: IntervalStats | undefined, s1h: IntervalStats | undefined): number {
  return 0.4 * scoreInterval(s5m) + 0.6 * scoreInterval(s1h);
}

export function recordDecisionSnapshot(mint: string, snap: AiDecisionSnapshot): void {
  const prev = decisionHistory.get(mint) ?? [];
  decisionHistory.set(mint, [...prev, snap].slice(-MAX_DECISION_SNAPSHOTS));
}

export function getDecisionHistory(mint: string): AiDecisionSnapshot[] {
  return decisionHistory.get(mint) ?? [];
}

export function clearDecisionHistory(mint: string): void {
  decisionHistory.delete(mint);
}

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

function formatDecisionHistory(snaps: AiDecisionSnapshot[] | undefined, currentComposite: number, currentPnl: number): string | null {
  if (!snaps || snaps.length === 0) return null;
  const now = Date.now();
  const sorted = [...snaps].sort((a, b) => a.ts - b.ts);
  const lines = sorted.map((s) => {
    const age = ageStr(now - s.ts);
    const sc = (s.composite >= 0 ? '+' : '') + s.composite.toFixed(2);
    return `- ${age}: ${s.action.toUpperCase()}@${s.confidence}% pnl=${s.pnlPct.toFixed(1)}% score=${sc}`;
  });
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const scoreDelta = currentComposite - first.composite;
  const pnlDelta = currentPnl - first.pnlPct;
  const spanMin = Math.max(1, Math.round((now - first.ts) / 60_000));
  const consecHolds = (() => {
    let n = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].action === 'hold') n++;
      else break;
    }
    return n;
  })();
  const trend = scoreDelta > 0.05 ? 'up' : scoreDelta < -0.05 ? 'DOWN' : 'flat';
  const summary = `Trajectory: composite ${trend} ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(2)} over ${spanMin}m; pnl delta ${pnlDelta >= 0 ? '+' : ''}${pnlDelta.toFixed(1)}%; ${consecHolds} consecutive HOLDs (last confidence=${last.confidence}%). Now: composite=${(currentComposite >= 0 ? '+' : '') + currentComposite.toFixed(2)} pnl=${currentPnl.toFixed(1)}%.`;
  return `Recent AI calls on this position (oldest→newest):\n${lines.join('\n')}\n${summary}`;
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
  decisionHistory?: AiDecisionSnapshot[];
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
  decisionHistory.clear();
  decisionLog.length = 0;
  rate.windowStart = Date.now();
  rate.count = 0;
}

function cacheKey(ctx: AdvisorContext): string {
  const histLen = ctx.history?.length ?? 0;
  if (ctx.kind === 'entry') {
    const rejLen = ctx.rejections?.length ?? 0;
    return `entry:${ctx.token.address}:h${histLen}:r${rejLen}`;
  }
  const comp = compositeScore(ctx.stats5m, ctx.stats1h);
  const scoreBucket = Math.round(comp * 10);
  const dhLen = ctx.decisionHistory?.length ?? 0;
  return `exit:${ctx.mint}:p${Math.round(ctx.pnlPct)}:s${scoreBucket}:h${histLen}:d${dhLen}`;
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
  const system = `You are a crypto trading assistant for a Solana memecoin bot. You evaluate trade signals and respond ONLY with strict JSON: {"action":"buy|hold|sell|skip","confidence":0-100,"reason":"<=120 chars"}. Confidence is certainty that your CHOSEN ACTION is correct given the data — NOT a price prediction probability. If evidence clearly favors skip/sell, confidence is high even if future price is uncertain. Calibrate: 90-100 = multiple independent signals strongly align (3+ timeframes agree, or volume+holders+price all confirm same direction); 80-89 = 2 strong signals agree with no conflict; 70-79 = single clear signal or mixed evidence; 50-69 = weak/ambiguous; <50 = near coin-flip. Do NOT cluster around 70-80 — if your reason cites multiple confirming signals or multiple timeframes, confidence MUST be 85+. If your reason cites 2+ bearish signals and you chose skip/sell, confidence MUST be 80+. For HOLD specifically: confidence tracks signal clarity, NOT the safeness of the default. Mixed or ambiguous evidence on an open position = HOLD at 55-70 (still the right default, but acknowledge uncertainty). HOLD at 80+ is reserved for strong continuation signals (rising price + holders + organic buys). Do NOT anchor HOLD to 80-85 just because HOLD is the exit default — if your reason contains words like "mixed", "slight", "potential", "no clear", confidence MUST be below 75. Memecoins are momentum plays — strong volume, rising holders, positive net buyers, and organic buy pressure are buy signals. Don't require perfection; weigh signals on balance. Skip only on clear red flags (dumping liquidity, sell-dominated volume, collapsing holders). If prior bot trades on this mint are provided, factor them in: repeated losses suggest caution; recent profitable exits on re-entry are a positive signal but don't guarantee repeat. If prior AI rejections on this mint are provided, check whether the flagged concerns are still present in current stats — if same red flags persist, keep skipping; if conditions materially improved, a fresh look is OK.

For EXIT decisions, default to HOLD. A trailing stop (auto-sells on drop from peak) and a take-profit target are already enforced outside your decision — you do NOT need to preempt them. Recommend SELL only on clear sustained reversal: negative 1h price change combined with negative holder change, collapsing liquidity, or sell-dominated organic volume across BOTH 5m AND 1h. Ignore single-candle 5m noise. Small green P&L is not a sell signal — let winners run toward the take-profit target. Only sell early if momentum is clearly breaking down at the higher timeframe.

A weighted composite score is provided per call, combining price, holders, net buyers, organic buy/sell ratio, liquidity, volume, and trade counts across 5m and 1h. Range [-1,+1]. Treat score ≤ -0.3 on 1h as confirmed bearish reversal — SELL with confidence 70+. Score ≤ -0.15 with held>30min and negative pnl trajectory = SELL candidate.

If a decision history is provided showing your prior calls on this position, USE IT. Repeating HOLD while composite score trends negative AND pnl deteriorates is a known failure mode — this is how the bot bleeds out losing positions. If the last 3+ calls were HOLD and composite is more negative now than then, AND pnl has worsened ≥5pct since the first of those HOLDs, you MUST bias toward SELL. Do not anchor to your own prior decisions when conditions have materially degraded. Breaking out of a HOLD-streak on deteriorating signals is the correct behavior, not inconsistency.

CRITICAL GUARDS (must obey):
1. Do NOT reference prior trades, prior losses, or prior HOLDs in your reason UNLESS the user message explicitly includes a "Recent AI calls on this position" block or a "Prior bot trades on this mint" block. If neither block is present, treat this as the FIRST decision on this position and do not invent history. Phrases like "prior trades show losses" or "recent losses" are forbidden when no history block was provided.
2. SCORE-SIGN GUARD: If blended composite score is ≥ 0 (neutral or bullish), SELL requires confidence ≥ 75 AND your reason MUST explicitly cite which specific metrics contradict the positive composite (e.g. "1h price -8% despite bullish 5m skew"). Do not call "sell" while narrating bearish signals that the numeric composite does not support. If you cannot cite a concrete contradicting metric, default to HOLD.
3. Your reason MUST be consistent with the numbers. If you write "negative 1h" your cited 1h priceChange or holderChange MUST actually be negative. Grounded reasons only.`;

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
  const s5 = scoreInterval(ctx.stats5m);
  const s1 = scoreInterval(ctx.stats1h);
  const comp = 0.4 * s5 + 0.6 * s1;
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
    `compositeScore: 5m=${(s5 >= 0 ? '+' : '') + s5.toFixed(2)} 1h=${(s1 >= 0 ? '+' : '') + s1.toFixed(2)} blended=${(comp >= 0 ? '+' : '') + comp.toFixed(2)} (weights: holderChange/netBuyers 1.2, price/organicRatio 1.0, liquidity 0.8, volume 0.5, volRatio 0.4, countRatio 0.3; blend 40% 5m / 60% 1h)`,
  ];
  const decisionBlock = formatDecisionHistory(ctx.decisionHistory, comp, ctx.pnlPct);
  if (decisionBlock) parts.push(decisionBlock);
  else parts.push('No prior AI calls on this position — this is the FIRST exit evaluation. Do NOT reference prior HOLDs or prior losses in your reason.');
  if (historyBlock) parts.push(historyBlock);
  else parts.push('No prior bot trades on this mint.');
  const scoreHint = comp >= 0
    ? `Composite score is ${(comp >= 0 ? '+' : '') + comp.toFixed(2)} (neutral/bullish). SCORE-SIGN GUARD applies: SELL requires confidence ≥75 AND explicit citation of a specific metric that contradicts the positive composite. Otherwise HOLD.`
    : `Composite score is ${comp.toFixed(2)} (bearish). Sell rubric may apply per system rules.`;
  parts.push(scoreHint);
  parts.push('Recommend SELL only on clear sustained reversal across 5m AND 1h. Otherwise HOLD. If prior-decision history shows a deteriorating HOLD-streak per rubric, SELL.');
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
