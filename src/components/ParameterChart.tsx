import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Loader, Maximize2 } from "lucide-react";
import { api } from "@/services/api";
import type { ChartDataPoint } from "@/components/parameterChartShared";
import {
  CHART_MAX_GAP_MS,
  formatApiRowsToChartData,
  computeYAxisDomain,
  insertTimeGapNulls,
  isNumericPoint,
  lineDotRenderer,
} from "@/components/parameterChartShared";
import { ParameterChartExpandDialog } from "@/components/ParameterChartExpandDialog";
import type { ChartPeriodOption } from "@/lib/chartPeriod";
import { getChartPeriodTimeRange, getChartWindowStartMs } from "@/lib/chartPeriod";

interface Parameter {
  key: string;
  label: string;
  unit: string;
  group: string;
  columnName?: string;
}

/** Refresh interval for chart and key-params updates (ms). Single source of truth. */
export const CHART_REFRESH_INTERVAL_MS = 60000;

function formatRefreshInterval(ms: number): string {
  if (ms >= 60000) return ms === 60000 ? '1 minute' : `${Math.round(ms / 60000)} minutes`;
  return ms === 1000 ? '1 second' : `${Math.round(ms / 1000)} seconds`;
}

interface ParameterChartProps {
  parameter: Parameter;
  value: number;
  deviceName: string;
  deviceId: string;
  period?: ChartPeriodOption;
  deviceStatus?: 'online' | 'offline' | 'connecting';
  lastSeen?: string;
}

export function ParameterChart({ parameter, value, deviceName, deviceId, period = '24-hours', deviceStatus, lastSeen }: ParameterChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastResponse, setLastResponse] = useState<{ data?: Array<{ timestamp: string; value: number | null }> } | null>(null);
  const [expandOpen, setExpandOpen] = useState(false);
  const [expandSnapshot, setExpandSnapshot] = useState<ChartDataPoint[]>([]);
  // 0 is a valid value for many parameters (especially alarm flags / counters)
  const hasData = value !== undefined && value !== null && !isNaN(value);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const isStale = (() => {
    if (!lastSeen) return false;
    const last = new Date(lastSeen).getTime();
    return Date.now() - last > 60 * 1000; // stale if older than 1 minute
  })();

  // Merge new points into existing series (unique by timestamp), keep chronological, cap length, and drop out-of-window data
  const mergeTimeSeries = (prev: ChartDataPoint[], incoming: ChartDataPoint[], windowStart?: number) => {
    const gapMs = CHART_MAX_GAP_MS;
    const map = new Map<number, ChartDataPoint>();
    prev.forEach(p => map.set(p.fullTime, p));
    incoming.forEach(p => map.set(p.fullTime, p));
    let merged = Array.from(map.values()).sort((a, b) => a.fullTime - b.fullTime);
    if (windowStart) {
      merged = merged.filter(p => p.fullTime >= windowStart);
    }
    merged = insertTimeGapNulls(merged, gapMs, timeZone);
    return merged.slice(Math.max(merged.length - 200, 0));
  };
  
  // Debug: Log chartData changes
  useEffect(() => {
    if (chartData.length > 0) {
      console.log(`[ParameterChart] Chart data updated for "${parameter.key}": ${chartData.length} points`, {
        first: chartData[0],
        last: chartData[chartData.length - 1],
        sampleValues: chartData.slice(0, 5).map(d => d.value)
      });
    } else if (lastResponse?.data && lastResponse.data.length > 0) {
      console.warn(`[ParameterChart] Chart data is empty but received ${lastResponse.data.length} points - all were filtered out`);
    }
  }, [chartData, parameter.key, lastResponse]);

  // Clear series first so we never briefly show the previous parameter/period window (must run before fetch effect).
  useEffect(() => {
    setChartData([]);
    setLastResponse(null);
  }, [period, deviceId, parameter.key, parameter.columnName]);

  // Fetch historical data from database
  useEffect(() => {
    let cancelled = false;
    let callIdx = 0;

    const fetchHistoricalData = async () => {
      const isInitialFetch = callIdx === 0;
      callIdx += 1;
      if (isInitialFetch) setLoading(true);

      try {
        const endTime = new Date();
        const { startTime, endTime: rangeEnd } = getChartPeriodTimeRange(period, endTime);
        const limit = 200;

        // Try to use columnName if available, otherwise use parameter key
        // columnName is the actual database column name, which is what the backend expects
        const paramName = parameter.columnName || parameter.key;
        
        console.log(`[ParameterChart] Fetching time-series for parameter: "${parameter.key}" (using: "${paramName}")`);
        
        const response = await api.getParameterTimeSeries(deviceId, paramName, {
          startTime: startTime.toISOString(),
          endTime: rangeEnd.toISOString(),
          limit
        });

        if (cancelled) return;

        console.log(`[ParameterChart] Received ${response.data?.length || 0} data points for "${parameter.key}"`);
        setLastResponse(response);
        
        if (response.data && response.data.length > 0) {
          // Log sample of raw data to debug
          console.log(`[ParameterChart] Sample raw data points (first 3):`, response.data.slice(0, 3));
          
          const formattedData = formatApiRowsToChartData(response.data, timeZone);
          
          console.log(`[ParameterChart] Formatted ${formattedData.length} valid data points out of ${response.data.length} total for "${parameter.key}"`);
          
          if (formattedData.length > 0) {
            const numericVals = formattedData.map(d => d.value).filter((v): v is number => typeof v === 'number' && !isNaN(v));
            const minValue = Math.min(...numericVals);
            const maxValue = Math.max(...numericVals);
            const valueRange = maxValue - minValue;
            console.log(`[ParameterChart] Sample formatted data point:`, formattedData[0]);
            console.log(`[ParameterChart] Value range: min=${minValue}, max=${maxValue}, range=${valueRange}`);
            console.log(`[ParameterChart] Setting chartData with ${formattedData.length} points`);
            console.log(`[ParameterChart] First 5 data points:`, formattedData.slice(0, 5));
            
            if (valueRange === 0 && formattedData.length > 0) {
              console.warn(`[ParameterChart] All values are the same (${minValue}) - chart line may appear flat`);
            }
            
          if (cancelled) return;
          setChartData(prev => mergeTimeSeries(prev, formattedData, startTime.getTime()));
          } else {
            // Check why all data was filtered
            const sampleValues = response.data.slice(0, 5).map((p: any) => ({ value: p.value, type: typeof p.value, isNull: p.value === null, isNaN: isNaN(p.value) }));
            console.warn(`[ParameterChart] All ${response.data.length} data points were filtered out for "${parameter.key}"`);
            console.warn(`[ParameterChart] Sample values analysis:`, sampleValues);
            // Set empty data so chart still renders
            if (!cancelled) setChartData([]);
          }
        } else {
          // No rows in this time window — do not synthesize a line from the live reading (misleading vs selected period).
          if (!cancelled) setChartData([]);
        }
      } catch (error) {
        console.error(`Error fetching historical data for ${parameter.key}:`, error);
        if (!cancelled) {
          setLastResponse(null);
          setChartData([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    fetchHistoricalData();
    
    const interval = setInterval(fetchHistoricalData, CHART_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deviceId, parameter.key, parameter.columnName, period]);

  const formatTick = (val: number) => {
    const d = new Date(val);
    switch (period) {
      case 'today':
      case '24-hours':
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone });
      case 'this-week':
      case '7-days':
      case '30-days':
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone });
      case '12-months':
        return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone });
      default:
        return d.toLocaleTimeString(undefined, { timeZone });
    }
  };

  // Append a new point when we receive a newer sample (based on lastSeen),
  // even if the numeric value stayed the same (flat line should still advance in time).
  useEffect(() => {
    // Do not append points if device is offline or data is stale
    if (deviceStatus !== 'online' || isStale) return;
    // Skip appending if we don't have a real value (avoids injecting zeros that came from fallback)
    if (!hasData) return;
    if (value === undefined || value === null || isNaN(value) || chartData.length === 0) return;

    const sampleTime = (() => {
      if (!lastSeen) return Date.now();
      const t = new Date(lastSeen).getTime();
      return isNaN(t) ? Date.now() : t;
    })();

    setChartData(prevData => {
      if (prevData.length === 0) return prevData;
      const lastNumeric = [...prevData].reverse().find(isNumericPoint);
      if (!lastNumeric) return prevData;
      if (sampleTime <= lastNumeric.fullTime) return prevData;

      const gapMs = CHART_MAX_GAP_MS;
      const newData = prevData.slice(1);
      const lastInWindow = [...newData].reverse().find(isNumericPoint);
      if (lastInWindow && sampleTime - lastInWindow.fullTime > gapMs) {
        const mid = lastInWindow.fullTime + (sampleTime - lastInWindow.fullTime) / 2;
        newData.push({
          displayTime: new Date(mid).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone }),
          value: null,
          fullTime: mid,
        });
      }
      const newTimestamp = new Date(sampleTime);
      newData.push({
        displayTime: newTimestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone }),
        value: value,
        fullTime: sampleTime,
      });

      // Trim to current window (based on period) when live appending
      const windowStart = getChartWindowStartMs(period, Date.now());

      return newData.filter(p => p.fullTime >= windowStart);
    });
  }, [lastSeen, value, deviceStatus, isStale, hasData, period, timeZone, chartData.length]);

  const getColorForParameter = (paramKey: string) => {
    switch (paramKey.charAt(0)) {
      case 'V': return '#2563eb'; // Blue for voltage
      case 'I': return '#16a34a'; // Green for current  
      case 'P': return '#ea580c'; // Orange for power
      case 'H': return '#9333ea'; // Purple for harmonics
      default: return '#6b7280'; // Gray for others
    }
  };

  const formatValue = (val: number | null | undefined) => {
    // Handle null, undefined, or non-numeric values
    if (val === null || val === undefined || isNaN(val) || typeof val !== 'number') {
      return 'N/A';
    }
    
    if (parameter.unit === '%') {
      return `${val.toFixed(1)}${parameter.unit}`;
    }
    if (parameter.key.startsWith('PF') || parameter.key.startsWith('Power Factor')) {
      return val.toFixed(3);
    }
    return `${val.toFixed(1)} ${parameter.unit}`;
  };

  const color = getColorForParameter(parameter.key);
  const statusNote = deviceStatus !== 'online' || isStale ? (
    <span className="text-xs text-muted-foreground">
      {deviceStatus !== 'online' ? 'Device offline' : 'No recent data'}
      {lastSeen ? ` • Last seen ${new Date(lastSeen).toLocaleString(undefined, { timeZone })}` : ''}
    </span>
  ) : null;

  const latestValue = (() => {
    for (let i = chartData.length - 1; i >= 0; i--) {
      const v = chartData[i].value;
      if (v !== null && v !== undefined && typeof v === 'number' && !isNaN(v)) return v;
    }
    return value;
  })();
  const hasValueToShow = latestValue !== undefined && latestValue !== null && !isNaN(latestValue);

  return (
    <>
    <ParameterChartExpandDialog
      open={expandOpen}
      onOpenChange={setExpandOpen}
      initialData={expandSnapshot}
      deviceId={deviceId}
      parameter={parameter}
      color={color}
      timeZone={timeZone}
      formatValue={formatValue}
    />
    <Card className="hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg">{parameter.label}</CardTitle>
            <CardDescription>
              {parameter.group} • {deviceName}
              {statusNote && <span className="ml-2">{statusNote}</span>}
            </CardDescription>
          </div>
          {chartData.length > 0 && !loading && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              title="Open zoom & drill-down"
              aria-label="Open zoom and drill-down chart"
              onClick={() => {
                setExpandSnapshot(chartData.map(d => ({ ...d })));
                setExpandOpen(true);
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="text-2xl font-bold" style={{ color }}>
          {hasValueToShow
            ? formatValue(latestValue as number)
            : <span className="text-muted-foreground">No Data</span>}
        </div>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <Loader className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">No data available</p>
              <p className="text-xs mt-1">
                {lastResponse?.data && lastResponse.data.length > 0
                  ? `Received ${lastResponse.data.length} points but all were filtered out (null/invalid values)`
                  : lastResponse?.data && lastResponse.data.length === 0
                    ? 'No samples in the selected time range.'
                    : 'Waiting for data...'}
              </p>
            </div>
          </div>
        ) : (
          <div className="h-48" style={{ minHeight: '192px', position: 'relative' }}>
            {chartData.length > 0 && (
              null
            )}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="fullTime" 
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                tickFormatter={formatTick}
                tickCount={6}
              />
              <YAxis 
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickCount={(parameter.unit === 'Hz' || parameter.key.toLowerCase().includes('frequency')) ? 7 : undefined}
                domain={chartData.length > 0 ? computeYAxisDomain(chartData, parameter) : [0, 100]}
                allowDataOverflow={false}
                tickFormatter={(val) => {
                  if (val === null || val === undefined || isNaN(val) || typeof val !== 'number') return 'N/A';
                  return parameter.unit === '%' ? `${val}%` : val.toFixed(1);
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value: number | null | undefined) => [formatValue(value), parameter.label]}
                labelFormatter={(label) => {
                  const d = new Date(label as number);
                  return d.toLocaleString(undefined, { timeZone });
                }}
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
        )}
        
        <div className="mt-4 text-xs text-muted-foreground">
          {chartData.length > 0
            ? `Real-time data • ${chartData.length} data points • Updates every ${formatRefreshInterval(CHART_REFRESH_INTERVAL_MS)}`
            : 'No historical data available yet'}
        </div>
      </CardContent>
    </Card>
    </>
  );
}