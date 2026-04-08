import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import { useOHLCV } from '../../hooks/useOHLCV';
import type { ChartInterval } from '../../hooks/usePriceHistory';
import {
  computeSMA,
  computeBB,
  computeRSI,
  computeMACD,
} from '../../utils/indicators';
import { Skeleton } from '../ui/Skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

type IndicatorKey = 'MA20' | 'MA50' | 'MA200' | 'BB' | 'RSI' | 'MACD';

interface Props {
  mint: string;
  symbol?: string;
  height?: number;
  minHeight?: number;
  maxHeight?: number;
}

const INTERVALS: ChartInterval[] = ['1H', '4H', '1D', '1W', '1M'];

// ─── Chart theme helpers ──────────────────────────────────────────────────────

const CHART_OPTS = (h: number) => ({
  height: h,
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: '#94a3b8',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 11,
  },
  grid: {
    vertLines: { color: '#1e2330' },
    horzLines: { color: '#1e2330' },
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: '#4a5568', style: 3 },
    horzLine: { color: '#4a5568', style: 3 },
  },
  rightPriceScale: { borderColor: '#1e2330' },
  timeScale:       { borderColor: '#1e2330', timeVisible: true },
});

const SUB_CHART_OPTS = (h: number) => ({
  ...CHART_OPTS(h),
  handleScroll: false,
  handleScale:  false,
  rightPriceScale: { borderColor: '#1e2330', scaleMargins: { top: 0.1, bottom: 0.1 } },
  timeScale: { borderColor: '#1e2330', timeVisible: false, visible: false },
});

// ─── Indicator colors ─────────────────────────────────────────────────────────

const COLORS: Record<IndicatorKey | 'bbFill', string> = {
  MA20:   '#3b82f6',
  MA50:   '#f97316',
  MA200:  '#ef4444',
  BB:     '#6366f1',
  bbFill: '#6366f120',
  RSI:    '#22c55e',
  MACD:   '#3b82f6',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TradingChart({
  mint,
  symbol = '',
  height = 300,
  minHeight = 150,
  maxHeight = 800,
}: Props) {
  const [interval, setInterval] = useState<ChartInterval>('1D');
  const [mainHeight, setMainHeight] = useState(height);
  const [active, setActive] = useState<Set<IndicatorKey>>(
    () => new Set<IndicatorKey>(['MA20', 'MA50']),
  );

  const { data: ohlcv, isLoading, isError } = useOHLCV(symbol || null, interval, mint);

  // ── Refs for chart containers ────────────────────────────────────────────
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef  = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);

  // ── Refs for chart instances ─────────────────────────────────────────────
  const mainChart = useRef<IChartApi | null>(null);
  const rsiChart  = useRef<IChartApi | null>(null);
  const macdChart = useRef<IChartApi | null>(null);

  // ── Refs for series ──────────────────────────────────────────────────────
  const candleSeries  = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ma20Series    = useRef<ISeriesApi<'Line'> | null>(null);
  const ma50Series    = useRef<ISeriesApi<'Line'> | null>(null);
  const ma200Series   = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMidSeries   = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowSeries   = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiSeries     = useRef<ISeriesApi<'Line'> | null>(null);
  const macdLineSeries= useRef<ISeriesApi<'Line'> | null>(null);
  const macdSigSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistSeries= useRef<ISeriesApi<'Histogram'> | null>(null);

  // ── Drag state ───────────────────────────────────────────────────────────
  const dragState = useRef({ dragging: false, startY: 0, startH: 0 });

  // ── Toggle helper ────────────────────────────────────────────────────────
  function toggle(key: IndicatorKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Initialize main chart ────────────────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current) return;

    const chart = createChart(mainRef.current, {
      ...CHART_OPTS(mainHeight),
      handleScroll: true,
      handleScale:  true,
    });

    candleSeries.current = chart.addCandlestickSeries({
      upColor:   '#22c55e',
      downColor: '#ef4444',
      borderUpColor:   '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor:   '#22c55e',
      wickDownColor: '#ef4444',
    });

    ma20Series.current = chart.addLineSeries({
      color: COLORS.MA20, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    });
    ma50Series.current = chart.addLineSeries({
      color: COLORS.MA50, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    });
    ma200Series.current = chart.addLineSeries({
      color: COLORS.MA200, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    });
    bbUpperSeries.current = chart.addLineSeries({
      color: COLORS.BB, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
    });
    bbMidSeries.current = chart.addLineSeries({
      color: COLORS.BB, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    });
    bbLowSeries.current = chart.addLineSeries({
      color: COLORS.BB, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
    });

    mainChart.current = chart;
    return () => {
      chart.remove();
      mainChart.current = null;
      candleSeries.current = null;
      ma20Series.current = ma50Series.current = ma200Series.current = null;
      bbUpperSeries.current = bbMidSeries.current = bbLowSeries.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initialize RSI chart ─────────────────────────────────────────────────
  useEffect(() => {
    if (!rsiRef.current) return;

    const chart = createChart(rsiRef.current, SUB_CHART_OPTS(80));
    const series = chart.addLineSeries({
      color: COLORS.RSI, lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
    });
    // Overbought/oversold lines
    series.createPriceLine({ price: 70, color: '#ef444460', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
    series.createPriceLine({ price: 30, color: '#22c55e60', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });

    rsiSeries.current = series;
    rsiChart.current  = chart;
    return () => {
      chart.remove();
      rsiChart.current = null;
      rsiSeries.current = null;
    };
  }, []);

  // ── Initialize MACD chart ────────────────────────────────────────────────
  useEffect(() => {
    if (!macdRef.current) return;

    const chart = createChart(macdRef.current, SUB_CHART_OPTS(80));
    macdHistSeries.current = chart.addHistogramSeries({
      color: '#22c55e', priceLineVisible: false, lastValueVisible: false,
    });
    macdLineSeries.current = chart.addLineSeries({
      color: COLORS.MACD, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    });
    macdSigSeries.current = chart.addLineSeries({
      color: COLORS.MA50, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
    });

    macdChart.current = chart;
    return () => {
      chart.remove();
      macdChart.current = null;
      macdHistSeries.current = null;
      macdLineSeries.current = null;
      macdSigSeries.current  = null;
    };
  }, []);

  // ── Feed OHLCV + indicators into charts ──────────────────────────────────
  useEffect(() => {
    if (!ohlcv || ohlcv.length === 0) return;
    if (!candleSeries.current || !mainChart.current) return;

    const times = ohlcv.map((p) => p.time as number);
    const closes = ohlcv.map((p) => p.close);

    // Candlesticks
    candleSeries.current.setData(
      ohlcv.map((p) => ({ time: p.time as import('lightweight-charts').Time, open: p.open, high: p.high, low: p.low, close: p.close })),
    );
    mainChart.current.timeScale().fitContent();

    // MA series
    const toLine = (vals: (number | null)[]) =>
      vals
        .map((v, i) => (v !== null ? { time: times[i] as import('lightweight-charts').Time, value: v } : null))
        .filter((x): x is NonNullable<typeof x> => x !== null);

    ma20Series.current?.setData(toLine(computeSMA(closes, 20)));
    ma50Series.current?.setData(toLine(computeSMA(closes, 50)));
    ma200Series.current?.setData(toLine(computeSMA(closes, 200)));

    // Bollinger Bands
    const bb = computeBB(closes);
    bbUpperSeries.current?.setData(toLine(bb.map((b) => b.upper)));
    bbMidSeries.current?.setData(toLine(bb.map((b) => b.middle)));
    bbLowSeries.current?.setData(toLine(bb.map((b) => b.lower)));

    // RSI
    if (rsiSeries.current && rsiChart.current) {
      rsiSeries.current.setData(toLine(computeRSI(closes)));
      rsiChart.current.timeScale().fitContent();
    }

    // MACD
    if (macdHistSeries.current && macdLineSeries.current && macdSigSeries.current && macdChart.current) {
      const macd = computeMACD(closes);
      macdHistSeries.current.setData(
        macd
          .map((m, i) =>
            m.histogram !== null
              ? {
                  time: times[i] as import('lightweight-charts').Time,
                  value: m.histogram,
                  color: m.histogram >= 0 ? '#22c55e80' : '#ef444480',
                }
              : null,
          )
          .filter((x): x is NonNullable<typeof x> => x !== null),
      );
      macdLineSeries.current.setData(toLine(macd.map((m) => m.macd)));
      macdSigSeries.current.setData(toLine(macd.map((m) => m.signal)));
      macdChart.current.timeScale().fitContent();
    }

    // Sync sub-chart time scales with main chart
    const unsub = mainChart.current.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      rsiChart.current?.timeScale().setVisibleLogicalRange(range);
      macdChart.current?.timeScale().setVisibleLogicalRange(range);
    });
    return () => { unsub(); };
  }, [ohlcv]);

  // ── Show/hide series based on active toggles ──────────────────────────────
  useEffect(() => {
    ma20Series.current?.applyOptions({ visible: active.has('MA20') });
    ma50Series.current?.applyOptions({ visible: active.has('MA50') });
    ma200Series.current?.applyOptions({ visible: active.has('MA200') });
    const bbOn = active.has('BB');
    bbUpperSeries.current?.applyOptions({ visible: bbOn });
    bbMidSeries.current?.applyOptions({ visible: bbOn });
    bbLowSeries.current?.applyOptions({ visible: bbOn });

    // When RSI/MACD panels become visible, resize after browser has re-laid out
    requestAnimationFrame(() => {
      const fallbackW = mainRef.current?.clientWidth ?? 600;
      if (active.has('RSI') && rsiRef.current && rsiChart.current) {
        rsiChart.current.resize(rsiRef.current.clientWidth || fallbackW, 80);
        rsiChart.current.timeScale().fitContent();
      }
      if (active.has('MACD') && macdRef.current && macdChart.current) {
        macdChart.current.resize(macdRef.current.clientWidth || fallbackW, 80);
        macdChart.current.timeScale().fitContent();
      }
    });
  }, [active]);

  // ── Resize main chart when mainHeight changes ─────────────────────────────
  useEffect(() => {
    if (!mainRef.current || !mainChart.current) return;
    const w = mainRef.current.clientWidth || 600;
    mainChart.current.resize(w, mainHeight);
  }, [mainHeight]);

  // ── ResizeObserver for container width changes ────────────────────────────
  useEffect(() => {
    const refs = [
      { el: mainRef.current, chart: mainChart, h: mainHeight },
      { el: rsiRef.current,  chart: rsiChart,  h: 80 },
      { el: macdRef.current, chart: macdChart,  h: 80 },
    ];
    const observers: ResizeObserver[] = [];
    refs.forEach(({ el, chart, h }) => {
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w) chart.current?.resize(w, h);
      });
      ro.observe(el);
      observers.push(ro);
    });
    return () => observers.forEach((ro) => ro.disconnect());
  }, [mainHeight]);

  // ── Drag handle logic ─────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragState.current = { dragging: true, startY: clientY, startH: mainHeight };

    function onMove(ev: MouseEvent | TouchEvent) {
      if (!dragState.current.dragging) return;
      const y = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const delta = y - dragState.current.startY;
      const newH = Math.max(minHeight, Math.min(maxHeight, dragState.current.startH + delta));
      setMainHeight(newH);
    }
    function onUp() {
      dragState.current.dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  }, [mainHeight, minHeight, maxHeight]);

  // ── Price change ─────────────────────────────────────────────────────────
  const priceChange = (() => {
    if (!ohlcv || ohlcv.length < 2) return null;
    const first = ohlcv[0].close;
    const last  = ohlcv[ohlcv.length - 1].close;
    const pct   = ((last - first) / first) * 100;
    return { pct, positive: pct >= 0 };
  })();

  // ── Indicator toggle buttons config ──────────────────────────────────────
  const indicators: { key: IndicatorKey; label: string; color: string }[] = [
    { key: 'MA20',  label: 'MA20',  color: COLORS.MA20  },
    { key: 'MA50',  label: 'MA50',  color: COLORS.MA50  },
    { key: 'MA200', label: 'MA200', color: COLORS.MA200 },
    { key: 'BB',    label: 'BB',    color: COLORS.BB    },
    { key: 'RSI',   label: 'RSI',   color: COLORS.RSI   },
    { key: 'MACD',  label: 'MACD',  color: COLORS.MACD  },
  ];

  return (
    <div className="flex flex-col gap-0">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          {symbol && <span className="text-xs font-medium text-text-dim">{symbol} / USD</span>}
          {priceChange !== null && (
            <span className={`text-xs font-semibold ${priceChange.positive ? 'text-green' : 'text-red-400'}`}>
              {priceChange.positive ? '+' : ''}{priceChange.pct.toFixed(2)}%
            </span>
          )}
          {isLoading && <span className="text-xs text-text-dim animate-pulse">Loading…</span>}
          {isError && <span className="text-xs text-red-400">Failed to load</span>}
        </div>

        {/* Interval buttons */}
        <div className="flex items-center gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
                interval === iv
                  ? 'bg-green/10 text-green font-medium'
                  : 'text-text-dim hover:text-text'
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

      {/* Indicator toggles */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {indicators.map(({ key, label, color }) => {
          const on = active.has(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                on
                  ? 'border-transparent text-white'
                  : 'border-border bg-surface text-text-dim hover:text-text'
              }`}
              style={on ? { backgroundColor: color + '30', borderColor: color + '80', color } : {}}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Main chart ────────────────────────────────────────────────────── */}
      <div className="relative">
        {isLoading && !ohlcv && (
          <Skeleton className="absolute inset-0 w-full rounded-lg" style={{ height: mainHeight }} />
        )}
        <div
          ref={mainRef}
          className="w-full"
          style={{ visibility: isLoading && !ohlcv ? 'hidden' : 'visible', height: mainHeight }}
        />
      </div>

      {/* ── Drag handle ───────────────────────────────────────────────────── */}
      <div
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        className="w-full flex items-center justify-center cursor-ns-resize group py-1"
        title="Drag to resize chart"
      >
        <div className="w-12 h-1 rounded-full bg-border group-hover:bg-text-dim transition-colors" />
      </div>

      {/* ── RSI panel — always in DOM so ref is available on init ─────────── */}
      <div style={{ display: active.has('RSI') ? 'flex' : 'none' }} className="flex-col">
        <div className="flex items-center gap-2 px-1 py-0.5">
          <span className="text-xs text-text-dim font-medium">RSI(14)</span>
        </div>
        <div ref={rsiRef} className="w-full" style={{ height: 80 }} />
      </div>

      {/* ── MACD panel — always in DOM so ref is available on init ──────── */}
      <div style={{ display: active.has('MACD') ? 'flex' : 'none' }} className="flex-col">
        <div className="flex items-center gap-2 px-1 py-0.5">
          <span className="text-xs text-text-dim font-medium">MACD(12,26,9)</span>
        </div>
        <div ref={macdRef} className="w-full" style={{ height: 80 }} />
      </div>
    </div>
  );
}
