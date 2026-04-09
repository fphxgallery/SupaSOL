import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  ColorType,
} from 'lightweight-charts';
import { usePriceHistory, type ChartInterval } from '../../hooks/usePriceHistory';
import { Skeleton } from '../ui/Skeleton';

interface Props {
  mint: string;
  symbol?: string;
  color?: string;
  height?: number;
}

const INTERVALS: ChartInterval[] = ['1H', '4H', '1D', '1W', '1M'];

export function PriceChart({ mint, symbol = '', color = '#22c55e', height = 200 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Area'> | null>(null);
  const [interval, setInterval] = useState<ChartInterval>('1D');

  const { data, isLoading, isError } = usePriceHistory(mint, interval);

  // ── Initialize chart (once per color change only) ─────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height,
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
        vertLine: { color: '#4a5568', style: 3 },
        horzLine: { color: '#4a5568', style: 3 },
      },
      rightPriceScale: { borderColor: '#1e2330' },
      timeScale:       { borderColor: '#1e2330', timeVisible: true },
      handleScroll: false,
      handleScale:  false,
    });

    const series = chart.addAreaSeries({
      lineColor:        color,
      topColor:         color + '30',
      bottomColor:      color + '05',
      lineWidth:        2,
      priceLineVisible: false,
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  // ── Resize chart when height prop changes ─────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !containerRef.current) return;
    const w = containerRef.current.getBoundingClientRect().width;
    chartRef.current.resize(w || containerRef.current.offsetWidth, height);
    chartRef.current.timeScale().fitContent();
  }, [height]);

  // ── Feed data into chart ──────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    if (!data || data.length === 0) return;

    const sorted = [...data]
      .sort((a, b) => a.time - b.time)
      .filter((p, i, arr) => i === 0 || p.time !== arr[i - 1].time)
      .map((p) => ({ time: p.time as LineData['time'], value: p.value }));

    seriesRef.current.setData(sorted);
    chartRef.current.timeScale().fitContent();
  }, [data]);

  // ── Resize observer (width only) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !chartRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && chartRef.current) {
        const h = chartRef.current.options().height ?? height;
        chartRef.current.resize(w, h);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Price change for the selected interval window ─────────────────────────
  const priceChange = (() => {
    if (!data || data.length < 2) return null;
    const first = data[0].value;
    const last  = data[data.length - 1].value;
    const pct   = ((last - first) / first) * 100;
    return { pct, positive: pct >= 0 };
  })();

  return (
    <div className="flex flex-col gap-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {symbol && (
            <span className="text-xs font-medium text-text-dim">{symbol} / USD</span>
          )}
          {priceChange !== null && (
            <span className={`text-xs font-semibold ${priceChange.positive ? 'text-green' : 'text-red'}`}>
              {priceChange.positive ? '+' : ''}{priceChange.pct.toFixed(2)}%
            </span>
          )}
          {isLoading && <span className="text-xs text-text-dim animate-pulse">Loading…</span>}
          {isError && <span className="text-xs text-red">Failed to load history</span>}
        </div>
        <div className="flex gap-1 ml-auto">
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

      <div className="relative">
        {isLoading && !data && (
          <Skeleton className="absolute inset-0 w-full rounded-lg" style={{ height }} />
        )}
        <div
          ref={containerRef}
          className="w-full"
          style={{ visibility: isLoading && !data ? 'hidden' : 'visible' }}
        />
      </div>
    </div>
  );
}
