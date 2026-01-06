import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine } from 'recharts';
import { TrendingUp, BarChart3, Loader } from "lucide-react";
import { api } from "@/services/api";

interface Parameter {
  key: string;
  label: string;
  unit: string;
  group: string;
  columnName?: string;
}

interface ParameterChartProps {
  parameter: Parameter;
  value: number;
  deviceName: string;
  deviceId: string;
  period?: '24-hours' | '7-days' | '30-days' | '12-months';
  deviceStatus?: 'online' | 'offline' | 'connecting';
  lastSeen?: string;
}

interface ChartDataPoint {
  value: number;
  fullTime: number; // epoch ms for time-scale axis
  displayTime: string; // for tooltip/labels
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case 'dip':
      return '#ef4444'; // red
    case 'breaker_trip':
      return '#dc2626'; // deeper red
    case 'crest_factor_high':
      return '#f97316'; // orange
    case 'k_factor_low':
      return '#a855f7'; // purple
    case 'pf_low':
    case 'pf_total_low':
      return '#f59e0b'; // amber
    case 'pf_high':
    case 'pf_total_high':
      return '#0ea5e9'; // sky
    case 'frequency_low':
    case 'frequency_high':
      return '#06b6d4'; // cyan
    case 'thd_voltage_high':
      return '#8b5cf6'; // violet
    case 'thd_current_high':
      return '#ec4899'; // pink
    case 'phase_loss':
      return '#7f1d1d'; // dark red
    case 'interruption':
      return '#111827'; // near-black
    case 'voltage_swell_s1':
    case 'voltage_swell_s2':
    case 'voltage_swell_s3':
    case 'voltage_swell_s4':
      return '#f97316'; // orange for S-type swells (> 120%)
    case 'voltage_swell_t1':
    case 'voltage_swell_t2':
    case 'voltage_swell_t3':
    case 'voltage_swell_t4':
      return '#eab308'; // yellow for T-type swells (110-120%)
    case 'over_voltage_alarm':
      return '#fb7185'; // rose
    case 'under_voltage_alarm':
      return '#60a5fa'; // blue
    case 'current_imbalance':
      return '#22c55e'; // green
    default:
      return '#ef4444';
  }
}

export function ParameterChart({ parameter, value, deviceName, deviceId, period = '24-hours', deviceStatus, lastSeen }: ParameterChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [loading, setLoading] = useState(true);
  const [lastResponse, setLastResponse] = useState<{ data?: Array<{ timestamp: string; value: number | null }> } | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [events, setEvents] = useState<Array<{ fullTime: number; description: string; eventType: string }>>([]);
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
    const map = new Map<number, ChartDataPoint>();
    prev.forEach(p => map.set(p.fullTime, p));
    incoming.forEach(p => map.set(p.fullTime, p));
    let merged = Array.from(map.values()).sort((a, b) => a.fullTime - b.fullTime);
    if (windowStart) {
      merged = merged.filter(p => p.fullTime >= windowStart);
    }
    // keep last 200 points to avoid growing unbounded
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

  // Fetch historical data from database
  useEffect(() => {
    const fetchHistoricalData = async () => {
      try {
        if (!hasFetched) setLoading(true);
        
        // Calculate time range based on selected period
        const endTime = new Date();
        let startTime = new Date(endTime);
        let limit = 200;

        switch (period) {
          case '24-hours':
            startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
            limit = 200;
            break;
          case '7-days':
            startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
            limit = 200;
            break;
          case '30-days':
            startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000);
            limit = 200;
            break;
          case '12-months':
            startTime = new Date(endTime.getTime() - 365 * 24 * 60 * 60 * 1000);
            limit = 200;
            break;
          default:
            startTime = new Date(endTime.getTime() - 20 * 60 * 1000);
            limit = 200;
        }
        
        // Try to use columnName if available, otherwise use parameter key
        // columnName is the actual database column name, which is what the backend expects
        const paramName = parameter.columnName || parameter.key;
        
        console.log(`[ParameterChart] Fetching time-series for parameter: "${parameter.key}" (using: "${paramName}")`);
        
        const response = await api.getParameterTimeSeries(deviceId, paramName, {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          limit
        });

        // Fetch events for this parameter in the same window (device_events table)
        try {
          const evRes = await api.getDeviceEvents(deviceId, {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            parameter: parameter.key,
          });
          const ev = (evRes.events || [])
            .map(e => {
              const t = new Date(e.eventTimestamp).getTime();
              if (isNaN(t)) return null;
              return { fullTime: t, description: e.description || 'Event', eventType: e.eventType || 'event' };
            })
            .filter((x): x is { fullTime: number; description: string; eventType: string } => x !== null);

          // Also fetch interruption markers (global, shown on every chart)
          let interruption: Array<{ fullTime: number; description: string; eventType: string }> = [];
          try {
            const intRes = await api.getDeviceEvents(deviceId, {
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              type: 'interruption',
            });
            interruption = (intRes.events || [])
              .map(e => {
                const t = new Date(e.eventTimestamp).getTime();
                if (isNaN(t)) return null;
                return { fullTime: t, description: e.description || 'Interruption', eventType: e.eventType || 'interruption' };
              })
              .filter((x): x is { fullTime: number; description: string; eventType: string } => x !== null);
          } catch {
            interruption = [];
          }

          // Merge + de-dupe by (eventType, fullTime)
          const merged = [...ev, ...interruption];
          const seen = new Set<string>();
          const deduped = merged.filter(m => {
            const k = `${m.eventType}:${m.fullTime}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          setEvents(deduped);
        } catch {
          // ignore if no events endpoint or no events
          setEvents([]);
        }
        
        console.log(`[ParameterChart] Received ${response.data?.length || 0} data points for "${parameter.key}"`);
        setLastResponse(response);
        
        if (response.data && response.data.length > 0) {
          // Log sample of raw data to debug
          console.log(`[ParameterChart] Sample raw data points (first 3):`, response.data.slice(0, 3));
          
          // Convert database data to chart format - filter out null/invalid values
          const formattedData: ChartDataPoint[] = response.data
            .map((point: { timestamp: string; value: number | string | null }) => {
              // Accept numeric strings by parsing them
              const rawVal = point.value;
              const numVal = typeof rawVal === 'string' ? Number(rawVal) : rawVal;
              const isValid = numVal !== null && numVal !== undefined && !isNaN(numVal) && typeof numVal === 'number' && isFinite(numVal);
              if (!isValid) return null;

            const timestamp = new Date(point.timestamp);
              return {
                displayTime: timestamp.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', timeZone }),
                value: numVal,
              fullTime: timestamp.getTime()
              };
            })
            .filter((d): d is ChartDataPoint => d !== null);
          
          console.log(`[ParameterChart] Formatted ${formattedData.length} valid data points out of ${response.data.length} total for "${parameter.key}"`);
          
          if (formattedData.length > 0) {
            const minValue = Math.min(...formattedData.map(d => d.value));
            const maxValue = Math.max(...formattedData.map(d => d.value));
            const valueRange = maxValue - minValue;
            console.log(`[ParameterChart] Sample formatted data point:`, formattedData[0]);
            console.log(`[ParameterChart] Value range: min=${minValue}, max=${maxValue}, range=${valueRange}`);
            console.log(`[ParameterChart] Setting chartData with ${formattedData.length} points`);
            console.log(`[ParameterChart] First 5 data points:`, formattedData.slice(0, 5));
            
            if (valueRange === 0 && formattedData.length > 0) {
              console.warn(`[ParameterChart] All values are the same (${minValue}) - chart line may appear flat`);
            }
            
          setChartData(prev => mergeTimeSeries(prev, formattedData, startTime.getTime()));
          } else {
            // Check why all data was filtered
            const sampleValues = response.data.slice(0, 5).map((p: any) => ({ value: p.value, type: typeof p.value, isNull: p.value === null, isNaN: isNaN(p.value) }));
            console.warn(`[ParameterChart] All ${response.data.length} data points were filtered out for "${parameter.key}"`);
            console.warn(`[ParameterChart] Sample values analysis:`, sampleValues);
            // Set empty data so chart still renders
            setChartData([]);
          }
        } else {
          if (!hasFetched) {
            // No historical data yet - create empty chart with current value (only on first load)
            const emptyData: ChartDataPoint[] = [];
            for (let i = 20; i >= 0; i--) {
              const timestamp = new Date();
              timestamp.setMinutes(timestamp.getMinutes() - i);
              emptyData.push({
                displayTime: timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone }),
                value: hasData ? value : 0,
                fullTime: timestamp.getTime()
              });
            }
            setChartData(emptyData);
          }
        }
      } catch (error) {
        console.error(`Error fetching historical data for ${parameter.key}:`, error);
        if (!hasFetched) {
          // Fallback to empty chart only on first load
          const emptyData: ChartDataPoint[] = [];
          for (let i = 20; i >= 0; i--) {
    const timestamp = new Date();
            timestamp.setMinutes(timestamp.getMinutes() - i);
            emptyData.push({
              displayTime: timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone }),
              value: hasData ? value : 0,
              fullTime: timestamp.getTime()
            });
          }
          setChartData(emptyData);
        }
      } finally {
        setHasFetched(true);
        setLoading(false);
      }
    };
    
    fetchHistoricalData();
    
    // Refresh data every 10 seconds to reduce flicker
    const interval = setInterval(fetchHistoricalData, 10000);
    return () => clearInterval(interval);
  }, [deviceId, parameter.key, parameter.columnName, period]);

  // Reset chart data when period changes to avoid mixing old windows
  useEffect(() => {
    setHasFetched(false);
    setChartData([]);
  }, [period, deviceId, parameter.key, parameter.columnName]);

  const formatTick = (val: number) => {
    const d = new Date(val);
    switch (period) {
      case '24-hours':
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone });
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
      const lastPoint = prevData[prevData.length - 1];
      // Only append when we have a newer sample timestamp
      if (sampleTime <= lastPoint.fullTime) return prevData;

      // Maintain a rolling window size (shift one, push one)
      const newData = prevData.slice(1);
      const newTimestamp = new Date(sampleTime);
      newData.push({
        displayTime: newTimestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone }),
        value: value,
        fullTime: sampleTime,
      });

      // Trim to current window (based on period) when live appending
      const windowStart = (() => {
        const endTime = Date.now();
        switch (period) {
          case '24-hours': return endTime - 24 * 60 * 60 * 1000;
          case '7-days': return endTime - 7 * 24 * 60 * 60 * 1000;
          case '30-days': return endTime - 30 * 24 * 60 * 60 * 1000;
          case '12-months': return endTime - 365 * 24 * 60 * 60 * 1000;
          default: return endTime - 20 * 60 * 1000;
        }
      })();

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
    if (parameter.key.startsWith('PF')) {
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

  const latestValue = chartData.length > 0 ? chartData[chartData.length - 1].value : value;
  const hasValueToShow = latestValue !== undefined && latestValue !== null && !isNaN(latestValue);

  return (
    <Card className="hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{parameter.label}</CardTitle>
            <CardDescription>
              {parameter.group} • {deviceName}
              {statusNote && <span className="ml-2">{statusNote}</span>}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setChartType('line')}
              className={`p-2 rounded transition-colors ${
                chartType === 'line' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartType('bar')}
              className={`p-2 rounded transition-colors ${
                chartType === 'bar' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
          </div>
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
            {chartType === 'line' ? (
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
                  domain={chartData.length > 0 ? (() => {
                    const values = chartData.map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
                    if (values.length === 0) return [0, 100];
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    const range = max - min;
                    // If all values are the same, add padding to make the line visible
                    if (range === 0) {
                      const padding = Math.abs(min) * 0.1 || 1;
                      return [min - padding, max + padding];
                    }
                    return ['dataMin', 'dataMax'];
                  })() : [0, 100]}
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
                {events.map((ev) => (
                  <ReferenceLine
                    key={`${ev.eventType}:${ev.fullTime}`}
                    x={ev.fullTime}
                    stroke={getEventColor(ev.eventType)}
                    strokeDasharray="4 4"
                    ifOverflow="hidden"
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  dot={{ fill: color, strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5, fill: color }}
                  isAnimationActive={true}
                  connectNulls={false}
                />
              </LineChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
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
                  domain={['dataMin', 'dataMax']}
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
                  labelFormatter={(label) => `Time: ${label}`}
                />
                {events.map((ev) => (
                  <ReferenceLine
                    key={`${ev.eventType}:${ev.fullTime}`}
                    x={ev.fullTime}
                    stroke={getEventColor(ev.eventType)}
                    strokeDasharray="4 4"
                    ifOverflow="hidden"
                  />
                ))}
                <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        )}
        
        <div className="mt-4 text-xs text-muted-foreground">
          {chartData.length > 0
            ? `Real-time data • ${chartData.length} data points • Updates every 5 seconds${events.length ? ` • ${events.length} event(s)` : ''}`
            : 'No historical data available yet'}
        </div>
      </CardContent>
    </Card>
  );
}