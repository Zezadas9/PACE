/**
 * Small charts.
 *
 * Deliberately not a charting library: these are eight bars and a trend line,
 * and a dependency for that would cost more in bundle than the whole feature.
 * Axes are omitted on purpose — at this size the shape is the message, and the
 * numbers that matter are already spelled out above the chart.
 */

import type { ReactElement } from 'react';

export interface ChartPoint {
  key: string;
  value: number;
  label?: string;
  /** Marks the current period, so "now" is findable at a glance. */
  current?: boolean;
}

export function BarChart({
  points, height = 64, format, emptyLabel = 'Sem dados',
}: {
  points: ChartPoint[];
  height?: number;
  format?: (value: number) => string;
  emptyLabel?: string;
}): ReactElement {
  const peak = Math.max(...points.map((p) => p.value), 0);
  if (points.length === 0 || peak <= 0) {
    return <p className="chart-empty t-sm muted-2">{emptyLabel}</p>;
  }

  return (
    <div className="chart">
      <div className="chart-bars" style={{ height }}>
        {points.map((point) => (
          <span
            key={point.key}
            className="chart-bar"
            data-current={String(!!point.current)}
            title={format ? `${point.label ?? point.key}: ${format(point.value)}` : undefined}
          >
            {/* A week with nothing in it draws no bar at all — the empty track
                already says "none", and a sliver read as a stray rule. */}
            {point.value > 0 ? (
              <i style={{ height: `${Math.max(6, (point.value / peak) * 100)}%` }} />
            ) : null}
          </span>
        ))}
      </div>
      {points.some((p) => p.label) ? (
        <div className="chart-labels">
          {points.map((point) => (
            <span key={point.key}>{point.label ?? ''}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A trend line for values where lower is better (pace).
 *
 * Inverted so improvement rises, which is what everyone reads a chart to see.
 */
export function TrendLine({
  points, height = 64, invert = false, emptyLabel = 'Sem dados',
}: {
  points: ChartPoint[];
  height?: number;
  invert?: boolean;
  emptyLabel?: string;
}): ReactElement {
  const real = points.filter((point) => point.value > 0);
  if (real.length < 2) return <p className="chart-empty t-sm muted-2">{emptyLabel}</p>;

  const values = real.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = real.map((point, index) => {
    const x = (index / (real.length - 1)) * 100;
    const normalized = (point.value - min) / span;
    const y = (invert ? normalized : 1 - normalized) * 100;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div className="chart">
      <svg className="trend" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
        <polyline points={coords.join(' ')} />
      </svg>
      {real.some((p) => p.label) ? (
        <div className="chart-labels">
          {real.map((point) => (
            <span key={point.key}>{point.label ?? ''}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
