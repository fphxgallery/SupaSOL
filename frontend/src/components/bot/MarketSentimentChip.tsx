import { useMarketSentiment } from '../../hooks/useMarketSentiment';
import type { MarketSentimentSnapshot } from '../../api/bot';

function clip(x: number, lim: number): number {
  return Math.max(-lim, Math.min(lim, x)) / lim;
}

export function computeSentimentScore(s: MarketSentimentSnapshot): number {
  const p6 = clip(s.avg6hPriceChange, 10);
  const p24 = clip(s.avg24hPriceChange, 10);
  // Breadth divergence: 5m vs 6h. Positive = leaders strengthening short-term, negative = exhausting.
  // Falls back to centered 6h breadth if 5m unavailable.
  const breadth = typeof s.pctPositiveNetBuyers5m === 'number'
    ? clip(s.pctPositiveNetBuyers5m - s.pctPositiveNetBuyers6h, 30)
    : (s.pctPositiveNetBuyers6h - 50) / 50;
  return p6 * 0.4 + p24 * 0.3 + breadth * 0.3;
}

function regimeLabel(score: number): { word: string; cls: string; dot: string } {
  if (score > 0.15) return { word: 'Bullish', cls: 'text-green border-green/40 bg-green/10', dot: 'bg-green' };
  if (score < -0.15) return { word: 'Bearish', cls: 'text-red border-red/40 bg-red/10', dot: 'bg-red' };
  return { word: 'Neutral', cls: 'text-text-dim border-border bg-surface-2', dot: 'bg-text-dim/60' };
}

export function MarketSentimentChip({ enabled }: { enabled: boolean }) {
  const { data } = useMarketSentiment(enabled);
  const snap = data?.sentiment;
  if (!snap) return null;
  const score = computeSentimentScore(snap);
  const { word, cls, dot } = regimeLabel(score);
  const breadthStr = typeof snap.pctPositiveNetBuyers5m === 'number'
    ? `breadth 5m/6h: ${snap.pctPositiveNetBuyers5m.toFixed(0)}%/${snap.pctPositiveNetBuyers6h.toFixed(0)}% (Δ${snap.pctPositiveNetBuyers5m - snap.pctPositiveNetBuyers6h >= 0 ? '+' : ''}${(snap.pctPositiveNetBuyers5m - snap.pctPositiveNetBuyers6h).toFixed(0)}pp)`
    : `breadth 6h: ${snap.pctPositiveNetBuyers6h.toFixed(0)}%`;
  const tip = `avg 6h: ${snap.avg6hPriceChange.toFixed(2)}% · avg 24h: ${snap.avg24hPriceChange.toFixed(2)}% · ${breadthStr} · n=${snap.sampleSize}`;
  return (
    <div
      title={tip}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      Mkt {word}
      <span className="font-mono tabular-nums opacity-80">{score >= 0 ? '+' : ''}{score.toFixed(2)}</span>
    </div>
  );
}
