import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, BarChart3 } from "lucide-react";

interface Parameter {
  key: string;
  label: string;
  unit: string;
  group: string;
}

interface ParameterChartProps {
  parameter: Parameter;
  value: number;
  deviceName: string;
}

// Generate mock historical data
const generateHistoricalData = (currentValue: number, points: number = 20) => {
  const data = [];
  const baseValue = currentValue;
  
  for (let i = points; i >= 0; i--) {
    const variation = (Math.random() - 0.5) * 0.2; // ±10% variation
    const timestamp = new Date();
    timestamp.setMinutes(timestamp.getMinutes() - i * 5); // 5-minute intervals
    
    data.push({
      time: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: Math.max(0, baseValue + baseValue * variation),
      fullTime: timestamp
    });
  }
  
  // Set the current value as the last point
  data[data.length - 1].value = currentValue;
  
  return data;
};

export function ParameterChart({ parameter, value, deviceName }: ParameterChartProps) {
  const [chartData, setChartData] = useState(() => generateHistoricalData(value));
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  useEffect(() => {
    // Update chart data with new value every few seconds
    const interval = setInterval(() => {
      setChartData(prevData => {
        const newData = [...prevData];
        // Remove the oldest point
        newData.shift();
        
        // Add new point with current value plus some variation
        const variation = (Math.random() - 0.5) * 0.1;
        const newTimestamp = new Date();
        newData.push({
          time: newTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          value: Math.max(0, value + value * variation),
          fullTime: newTimestamp
        });
        
        return newData;
      });
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [value]);

  const getColorForParameter = (paramKey: string) => {
    switch (paramKey.charAt(0)) {
      case 'V': return '#2563eb'; // Blue for voltage
      case 'I': return '#16a34a'; // Green for current  
      case 'P': return '#ea580c'; // Orange for power
      case 'H': return '#9333ea'; // Purple for harmonics
      default: return '#6b7280'; // Gray for others
    }
  };

  const formatValue = (val: number) => {
    if (parameter.unit === '%') {
      return `${val.toFixed(1)}${parameter.unit}`;
    }
    if (parameter.key.startsWith('PF')) {
      return val.toFixed(3);
    }
    return `${val.toFixed(1)} ${parameter.unit}`;
  };

  const color = getColorForParameter(parameter.key);

  return (
    <Card className="hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{parameter.label}</CardTitle>
            <CardDescription>{parameter.group} • {deviceName}</CardDescription>
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
          {formatValue(value)}
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis 
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => parameter.unit === '%' ? `${val}%` : val.toFixed(1)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value: number) => [formatValue(value), parameter.label]}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  dot={{ fill: color, strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5, fill: color }}
                />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis 
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => parameter.unit === '%' ? `${val}%` : val.toFixed(1)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value: number) => [formatValue(value), parameter.label]}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        
        <div className="mt-4 text-xs text-muted-foreground">
          Real-time data • Updates every 5 seconds
        </div>
      </CardContent>
    </Card>
  );
}