import type { ReactElement } from 'react';

/** If consecutive numeric samples are farther apart than this, the line is not drawn across the gap. */
export const CHART_MAX_GAP_MS = 30 * 60 * 1000;

export interface ChartDataPoint {
  value: number | null;
  fullTime: number;
  displayTime: string;
}

export interface ChartParameterLite {
  key: string;
  unit: string;
}

export function isNumericPoint(p: ChartDataPoint): boolean {
  return p.value !== null && p.value !== undefined && typeof p.value === 'number' && !isNaN(p.value);
}

export function insertTimeGapNulls(
  sorted: ChartDataPoint[],
  maxGapMs: number,
  timeZone: string
): ChartDataPoint[] {
  if (sorted.length < 2) return sorted;
  const out: ChartDataPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const dt = cur.fullTime - prev.fullTime;
      if (dt > maxGapMs && isNumericPoint(prev) && isNumericPoint(cur)) {
        const mid = prev.fullTime + dt / 2;
        out.push({
          fullTime: mid,
          value: null,
          displayTime: new Date(mid).toLocaleString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            timeZone,
          }),
        });
      }
    }
    out.push(sorted[i]);
  }
  return out;
}

/** Parse API rows, sort by time (gap nulls applied by merge or withGapNulls). */
export function formatApiRowsToChartData(
  rows: Array<{ timestamp: string; value: number | string | null }> | undefined,
  timeZone: string
): ChartDataPoint[] {
  if (!rows?.length) return [];
  const out: ChartDataPoint[] = [];
  for (const point of rows) {
    const rawVal = point.value;
    const numVal = typeof rawVal === 'string' ? Number(rawVal) : rawVal;
    if (
      numVal === null ||
      numVal === undefined ||
      typeof numVal !== 'number' ||
      !isFinite(numVal) ||
      isNaN(numVal)
    ) {
      continue;
    }
    const timestamp = new Date(point.timestamp);
    const t = timestamp.getTime();
    if (isNaN(t)) continue;
    out.push({
      displayTime: timestamp.toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      }),
      value: numVal,
      fullTime: t,
    });
  }
  out.sort((a, b) => a.fullTime - b.fullTime);
  return out;
}

export function withGapNulls(points: ChartDataPoint[], timeZone: string): ChartDataPoint[] {
  return insertTimeGapNulls(points, CHART_MAX_GAP_MS, timeZone);
}

export function computeYAxisDomain(
  chartData: ChartDataPoint[],
  parameter: ChartParameterLite
): [number, number] {
  const values = chartData
    .map(d => d.value)
    .filter((v): v is number => v !== null && v !== undefined && typeof v === 'number' && !isNaN(v));
  if (values.length === 0) return [0, 100];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const isFrequency = parameter.unit === 'Hz' || parameter.key.toLowerCase().includes('frequency');
  if (isFrequency) {
    const median = values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 50;
    const nominal = median >= 57 ? 60 : 50;
    const band = 1.5;
    return [nominal - band, nominal + band];
  }
  const isPF =
    parameter.key.toLowerCase().includes('power factor') ||
    parameter.key.toLowerCase().includes('pf');
  if (isPF) {
    return [-1, 1];
  }
  const padding = range > 0 ? Math.max(range * 0.05, 0.5) : (Math.abs(max) || 1) * 0.1;
  if (range === 0) {
    const yMin = min < 0 ? min - padding : Math.max(0, min - padding);
    return [yMin, max + padding];
  }
  const yMin = min < 0 ? min - padding : 0;
  const yMax = max + padding;
  return [yMin, yMax];
}

export function lineDotRenderer(color: string) {
  return (props: { cx?: number; cy?: number; payload?: ChartDataPoint }): ReactElement | null => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return null;
    const v = payload.value;
    if (v === null || v === undefined || typeof v !== 'number' || Number.isNaN(v)) return null;
    return (
      <circle cx={cx} cy={cy} r={3} fill={color} stroke="#fff" strokeWidth={1} />
    );
  };
}
