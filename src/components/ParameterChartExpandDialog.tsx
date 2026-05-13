import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ChartDataPoint, ChartParameterLite } from '@/components/parameterChartShared';
import {
  formatApiRowsToChartData,
  lineDotRenderer,
  computeYAxisDomain,
  withGapNulls,
} from '@/components/parameterChartShared';

function formatModalXTick(val: number, timeSpanMs: number, timeZone: string) {
  const d = new Date(val);
  if (timeSpanMs <= 3 * 60 * 60 * 1000) {
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone,
    });
  }
  if (timeSpanMs <= 48 * 60 * 60 * 1000) {
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone });
}

export interface ParameterChartExpandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: ChartDataPoint[];
  deviceId: string;
  parameter: ChartParameterLite & { label: string; columnName?: string };
  color: string;
  timeZone: string;
  formatValue: (val: number | null | undefined) => string;
}

export function ParameterChartExpandDialog({
  open,
  onOpenChange,
  initialData,
  deviceId,
  parameter,
  color,
  timeZone,
  formatValue,
}: ParameterChartExpandDialogProps) {
  const [modalData, setModalData] = useState<ChartDataPoint[]>([]);
  const [zoomX0, setZoomX0] = useState<number | null>(null);
  const [zoomX1, setZoomX1] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const zoomWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const copy = initialData.map(d => ({ ...d }));
    setModalData(copy);
    setZoomX0(null);
    setZoomX1(null);
  }, [open, initialData]);

  const globalTimeBounds = useMemo(() => {
    if (!modalData.length) return { min: 0, max: 0 };
    return { min: modalData[0].fullTime, max: modalData[modalData.length - 1].fullTime };
  }, [modalData]);

  const spanForTick =
    zoomX0 != null && zoomX1 != null ? zoomX1 - zoomX0 : globalTimeBounds.max - globalTimeBounds.min;

  const onWheelZoom = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (modalData.length < 2) return;
      const { min: globalMin, max: globalMax } = globalTimeBounds;
      if (globalMax <= globalMin) return;
      const rect = zoomWrapRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      let x0 = zoomX0 ?? globalMin;
      let x1 = zoomX1 ?? globalMax;
      const span = x1 - x0;
      if (span <= 0) return;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const minSpan = 60 * 1000;
      const maxSpan = globalMax - globalMin;
      const newSpan = Math.min(maxSpan, Math.max(minSpan, span * factor));
      const ratio = (e.clientX - rect.left) / rect.width;
      const center = x0 + ratio * span;
      let n0 = center - newSpan / 2;
      let n1 = center + newSpan / 2;
      if (n0 < globalMin) {
        n1 = Math.min(globalMax, n1 + (globalMin - n0));
        n0 = globalMin;
      }
      if (n1 > globalMax) {
        n0 = Math.max(globalMin, n0 - (n1 - globalMax));
        n1 = globalMax;
      }
      setZoomX0(n0);
      setZoomX1(n1);
    },
    [modalData.length, globalTimeBounds.min, globalTimeBounds.max, zoomX0, zoomX1]
  );

  const resetZoom = () => {
    setZoomX0(null);
    setZoomX1(null);
  };

  const resetToSnapshot = () => {
    const copy = initialData.map(d => ({ ...d }));
    setModalData(copy);
    resetZoom();
  };

  const loadSelection = async () => {
    if (modalData.length === 0) return;
    const { min: gMin, max: gMax } = globalTimeBounds;
    if (gMax <= gMin) return;
    const t0 = zoomX0 != null && zoomX1 != null ? Math.min(zoomX0, zoomX1) : gMin;
    const t1 = zoomX0 != null && zoomX1 != null ? Math.max(zoomX0, zoomX1) : gMax;
    if (t1 - t0 < 30 * 1000) return;
    const paramName = parameter.columnName || parameter.key;
    setLoading(true);
    try {
      const response = await api.getParameterTimeSeries(deviceId, paramName, {
        startTime: new Date(t0).toISOString(),
        endTime: new Date(t1).toISOString(),
        limit: 500,
      });
      const rows = formatApiRowsToChartData(response.data, timeZone);
      const next = withGapNulls(rows, timeZone);
      setModalData(next);
      resetZoom();
    } catch (err) {
      console.error('[ParameterChartExpandDialog]', err);
    } finally {
      setLoading(false);
    }
  };

  const xDomain: [number, number] | readonly ['dataMin', 'dataMax'] =
    zoomX0 != null && zoomX1 != null && modalData.length > 0 ? [zoomX0, zoomX1] : (['dataMin', 'dataMax'] as const);

  const yDomain = computeYAxisDomain(modalData, parameter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl gap-3 overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="pr-8">{parameter.label} — zoom & drill-down</DialogTitle>
          <DialogDescription>
            Scroll over the chart to zoom the time axis. Use &quot;Load this range&quot; to fetch up to 500
            samples for the visible time window (scroll-zoomed slice, or the full series if you have not zoomed).
          </DialogDescription>
        </DialogHeader>
        {modalData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No series data to explore.</p>
        ) : (
          <>
            <div
              ref={zoomWrapRef}
              className="relative w-full min-h-[50vh]"
              onWheel={onWheelZoom}
              style={{ touchAction: 'none' }}
            >
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                  <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              <ResponsiveContainer width="100%" height={480}>
                <LineChart data={modalData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="fullTime"
                    type="number"
                    scale="time"
                    domain={xDomain}
                    allowDataOverflow
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => formatModalXTick(Number(v), spanForTick, timeZone)}
                    tickCount={8}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={yDomain}
                    allowDataOverflow={false}
                    tickFormatter={(val) => {
                      if (val === null || val === undefined || isNaN(val) || typeof val !== 'number')
                        return 'N/A';
                      return parameter.unit === '%' ? `${val}%` : val.toFixed(1);
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                    }}
                    formatter={(v: number | null | undefined) => [formatValue(v), parameter.label]}
                    labelFormatter={(label) =>
                      new Date(label as number).toLocaleString(undefined, { timeZone })
                    }
                  />
                  <Line
                    type="linear"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={2}
                    dot={lineDotRenderer(color)}
                    activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 1 }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
              <Button type="button" variant="outline" size="sm" onClick={resetZoom}>
                Reset scroll zoom
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={resetToSnapshot}>
                Reset to card data
              </Button>
              <Button type="button" size="sm" onClick={loadSelection} disabled={loading || modalData.length === 0}>
                Load this range
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
