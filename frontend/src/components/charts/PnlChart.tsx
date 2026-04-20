import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type LineData, ColorType } from 'lightweight-charts';
import type { ClosedPosition } from '../../store/botStore';

interface Props {
  closed: ClosedPosition[];
  height?: number;
}

export function PnlChart({ closed, height = 180 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const totalPnl = closed.reduce((s, p) => s + p.pnlSol, 0);
  const color = totalPnl >= 0 ? '#22c55e' : '#ef4444';

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
      timeScale: { borderColor: '#1e2330', timeVisible: true },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: color + '30',
      bottomColor: color + '05',
      lineWidth: 2,
      priceLineVisible: false,
      priceFormat: { type: 'custom', formatter: (v: number) => v.toFixed(4) + ' SOL' },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    if (closed.length === 0) {
      seriesRef.current.setData([]);
      return;
    }

    const sorted = [...closed].sort((a, b) => a.exitTime - b.exitTime);
    let cumulative = 0;
    const points: LineData[] = [];

    // Anchor at 0 just before first trade
    points.push({ time: Math.floor(sorted[0].exitTime / 1000) - 1 as LineData['time'], value: 0 });

    for (const p of sorted) {
      cumulative += p.pnlSol;
      const t = Math.floor(p.exitTime / 1000);
      // Deduplicate same-second timestamps by nudging
      const last = points[points.length - 1];
      const time = (last && (last.time as number) >= t ? (last.time as number) + 1 : t) as LineData['time'];
      points.push({ time, value: cumulative });
    }

    seriesRef.current.setData(points);
    chartRef.current.timeScale().fitContent();
  }, [closed]);

  useEffect(() => {
    if (!containerRef.current || !chartRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && chartRef.current) chartRef.current.resize(w, height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (closed.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-text-dim" style={{ height }}>
        No trades yet — chart will appear after first closed position
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" />;
}
