// ─── Technical Indicator Computations ────────────────────────────────────────
// All functions operate on arrays of close prices (number[]) and return
// parallel arrays of the same length. Values before enough data exists are null.

/** Simple Moving Average */
export function computeSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    return sum / period;
  });
}

/** Exponential Moving Average */
export function computeEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return result;

  const k = 2 / (period + 1);
  // Seed with SMA of first `period` values
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = prev;

  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    result[i] = prev;
  }
  return result;
}

/** Bollinger Bands (SMA ± mult × stddev) */
export function computeBB(
  closes: number[],
  period = 20,
  mult = 2,
): { upper: number | null; middle: number | null; lower: number | null }[] {
  const sma = computeSMA(closes, period);
  return closes.map((_, i) => {
    const mid = sma[i];
    if (mid === null) return { upper: null, middle: null, lower: null };
    // Population std dev over the window
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (closes[j] - mid) ** 2;
    }
    const std = Math.sqrt(variance / period);
    return { upper: mid + mult * std, middle: mid, lower: mid - mult * std };
  });
}

/** Relative Strength Index */
export function computeRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  let avgGain = 0;
  let avgLoss = 0;

  // Seed: average gain/loss over first `period` changes
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= period;
  avgLoss /= period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    // Wilder smoothing
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsI = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rsI);
  }
  return result;
}

/** MACD — returns macd line, signal line, and histogram */
export function computeMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: number | null; signal: number | null; histogram: number | null }[] {
  const fastEMA = computeEMA(closes, fast);
  const slowEMA = computeEMA(closes, slow);

  // MACD line = fastEMA - slowEMA (null if either is null)
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = fastEMA[i];
    const s = slowEMA[i];
    return f !== null && s !== null ? f - s : null;
  });

  // Signal = EMA(macdLine, signalPeriod) — compute only over non-null values
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  const firstMacd = macdLine.findIndex((v) => v !== null);
  if (firstMacd !== -1) {
    // Extract non-null macd values and their indices
    const nonNull: { idx: number; val: number }[] = [];
    for (let i = firstMacd; i < macdLine.length; i++) {
      if (macdLine[i] !== null) nonNull.push({ idx: i, val: macdLine[i] as number });
    }
    // EMA over the extracted values
    const sigK = 2 / (signalPeriod + 1);
    let prev: number | null = null;
    for (let j = 0; j < nonNull.length; j++) {
      if (j < signalPeriod - 1) continue;
      if (prev === null) {
        // Seed with SMA of first signalPeriod macd values
        let sum = 0;
        for (let k = 0; k < signalPeriod; k++) sum += nonNull[k].val;
        prev = sum / signalPeriod;
        signalLine[nonNull[signalPeriod - 1].idx] = prev;
      } else {
        prev = nonNull[j].val * sigK + prev * (1 - sigK);
        signalLine[nonNull[j].idx] = prev;
      }
    }
  }

  return closes.map((_, i) => {
    const m = macdLine[i];
    const s = signalLine[i];
    return {
      macd: m,
      signal: s,
      histogram: m !== null && s !== null ? m - s : null,
    };
  });
}
