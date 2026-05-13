import { useState, useEffect } from "react";
import { 
  AlertTriangle, 
  Zap, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  BarChart3, 
  Lightbulb,
  Battery,
  Filter,
  Shield,
  Settings
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Device } from "./EnergyDashboard";
import { api } from "@/services/api";
import type { ChartPeriodOption } from "@/lib/chartPeriod";
import { getChartPeriodTimeRange } from "@/lib/chartPeriod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EventItem = {
  label: string;
  count: number;
  timestamps: string[];
};

interface PowerQualityDashboardProps {
  device: Device;
  selectedPeriod?: ChartPeriodOption;
  onPeriodChange?: (period: ChartPeriodOption) => void;
}

interface PowerQualityEvent {
  id: string;
  type: 'power-quality' | 'steady-state' | 'equipment';
  severity: 'low' | 'medium' | 'high';
  count: number;
  lastOccurrence: Date;
}

const POWER_QUALITY_CARDS = [
  // Power Quality Events
  {
    id: 'interruptions',
    title: 'Interruptions',
    subtitle: 'Power Quality Event',
    icon: AlertTriangle,
    severity: 'low' as const,
    type: 'power-quality' as const,
    apiEndpoint: '/api/power-quality/interruptions'
  },
  {
    id: 'transient-voltage',
    title: 'Transient Voltage',
    subtitle: 'Power Quality Event',
    icon: Zap,
    severity: 'low' as const,
    type: 'power-quality' as const,
    apiEndpoint: '/api/power-quality/transient-voltage'
  },
  {
    id: 'over-voltage',
    title: 'Over Voltage',
    subtitle: 'Power Quality Event',
    icon: TrendingUp,
    severity: 'low' as const,
    type: 'power-quality' as const,
    apiEndpoint: '/api/power-quality/over-voltage'
  },
  {
    id: 'unbalance',
    title: 'Unbalance',
    subtitle: 'Steady State Disturbance',
    icon: Activity,
    severity: 'low' as const,
    type: 'steady-state' as const,
    apiEndpoint: '/api/power-quality/unbalance'
  },
  {
    id: 'frequency-variation',
    title: 'Frequency Variation',
    subtitle: 'Steady State Disturbance',
    icon: BarChart3,
    severity: 'low' as const,
    type: 'steady-state' as const,
    apiEndpoint: '/api/power-quality/frequency-variation'
  },
  {
    id: 'voltage-sag',
    title: 'Voltage Sag',
    subtitle: 'Power Quality Event',
    icon: TrendingDown,
    severity: 'medium' as const,
    type: 'power-quality' as const,
    apiEndpoint: '/api/power-quality/voltage-sag'
  },
  {
    id: 'voltage-swell',
    title: 'Voltage Swell',
    subtitle: 'Power Quality Event',
    icon: TrendingUp,
    severity: 'medium' as const,
    type: 'power-quality' as const,
    apiEndpoint: '/api/power-quality/voltage-swell'
  },
  {
    id: 'under-voltage',
    title: 'Under Voltage',
    subtitle: 'Power Quality Event',
    icon: TrendingDown,
    severity: 'low' as const,
    type: 'power-quality' as const,
    apiEndpoint: '/api/power-quality/under-voltage'
  },
  {
    id: 'harmonics',
    title: 'Harmonics',
    subtitle: 'Steady State Disturbance',
    icon: BarChart3,
    severity: 'low' as const,
    type: 'steady-state' as const,
    apiEndpoint: '/api/power-quality/harmonics'
  },
  {
    id: 'flicker',
    title: 'Flicker',
    subtitle: 'Steady State Disturbance',
    icon: Lightbulb,
    severity: 'low' as const,
    type: 'steady-state' as const,
    apiEndpoint: '/api/power-quality/flicker'
  },
  // Corrective Equipment Status
  {
    id: 'capacitor-banks',
    title: 'Capacitor Banks',
    subtitle: 'Corrective Equipment',
    icon: Battery,
    severity: 'low' as const,
    type: 'equipment' as const,
    apiEndpoint: '/api/equipment/capacitor-banks'
  },
  {
    id: 'active-harmonic-filters',
    title: 'Active Harmonic Filters',
    subtitle: 'Corrective Equipment',
    icon: Filter,
    severity: 'low' as const,
    type: 'equipment' as const,
    apiEndpoint: '/api/equipment/harmonic-filters'
  },
  {
    id: 'ups',
    title: 'UPS',
    subtitle: 'Corrective Equipment',
    icon: Shield,
    severity: 'low' as const,
    type: 'equipment' as const,
    apiEndpoint: '/api/equipment/ups'
  }
];

export function PowerQualityDashboard({ device, selectedPeriod: controlledPeriod, onPeriodChange }: PowerQualityDashboardProps) {
  const [internalPeriod, setInternalPeriod] = useState<ChartPeriodOption>(controlledPeriod || '30-days');
  const selectedPeriod = controlledPeriod || internalPeriod;
  const [powerQualityData, setPowerQualityData] = useState<Record<string, PowerQualityEvent>>({});
  const [eventData, setEventData] = useState<Record<string, EventItem>>({});
  const [interruptions, setInterruptions] = useState<{ count: number; timestamps: string[] }>({ count: 0, timestamps: [] });
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Backend API integration functions
  const fetchCardData = async (cardId: string, apiEndpoint: string, period: string) => {
    try {
      console.log(`Fetching data for ${cardId} from ${apiEndpoint} with period=${period}`);
      
      // Backend API call
      const response = await fetch(`${apiEndpoint}/${device.id}?period=${period}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}` // Add auth if needed
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ${cardId} data`);
      }
      
      const data = await response.json();
      
      // Update local state with fetched data
      setPowerQualityData(prev => ({
        ...prev,
        [cardId]: data
      }));
      
      // Optional: Navigate to detailed view or show modal
      console.log(`${cardId} data:`, data);
      
    } catch (error) {
      console.error(`Error fetching ${cardId} data:`, error);
      // Handle error (show toast, etc.)
    }
  };

  const handleCardClick = async (cardId: string, apiEndpoint: string) => {
    fetchCardData(cardId, apiEndpoint, selectedPeriod);
  };

  const handlePeriodChange = (period: ChartPeriodOption | string) => {
    const p = period as ChartPeriodOption;
    setInternalPeriod(p);
    if (onPeriodChange) onPeriodChange(p);
  };

  // Keep internal state in sync if parent controls it
  useEffect(() => {
    if (controlledPeriod && controlledPeriod !== internalPeriod) {
      setInternalPeriod(controlledPeriod);
    }
  }, [controlledPeriod]);

  // Auto-refresh events when period changes or on interval
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoadingEvents(true);
        const { startTime, endTime } = getChartPeriodTimeRange(selectedPeriod);
        
        console.log(`[PowerQualityDashboard] Fetching events for device ${device.id}`, {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          period: selectedPeriod
        });
        
        const resp = await api.getDeviceEvents(device.id, {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        });
        
        console.log('[PowerQualityDashboard] Events API response:', {
          deviceId: resp.deviceId,
          count: resp.count,
          hasData: !!resp.data,
          hasEvents: !!resp.events,
          dataLength: resp.data?.length,
          eventsLength: resp.events?.length
        });
        
        // Handle both response structures (data or events)
        const events = resp.data || resp.events || [];
        
        if (events.length === 0) {
          console.log('[PowerQualityDashboard] No events found in response');
        }
        
        // Group events by event_type and parameter
        const grouped: Record<string, EventItem> = {};
        events.forEach((evt: any) => {
          console.log('[PowerQualityDashboard] Processing event:', evt);
          // Create a unique key for each event type + parameter combination
          const key = `${evt.eventType}_${evt.parameter}`;
          const label = `${evt.parameter} - ${evt.eventType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}`;
          
          if (!grouped[key]) {
            grouped[key] = { label, count: 0, timestamps: [] };
          }
          grouped[key].count++;
          if (evt.eventTimestamp) {
            grouped[key].timestamps.push(evt.eventTimestamp);
          }
        });
        
        console.log('[PowerQualityDashboard] Grouped events:', grouped);
        
        // Sort timestamps in descending order
        Object.values(grouped).forEach(evt => {
          evt.timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        });
        
        setEventData(grouped);
      } catch (err) {
        console.error('[PowerQualityDashboard] Failed to fetch device events:', err);
        setEventData({});
      } finally {
        setLoadingEvents(false);
      }
    };
    
    fetchEvents();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      fetchEvents();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [selectedPeriod, device.id]);

  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'low':
        return 'bg-success';
      case 'medium':
        return 'bg-warning';
      case 'high':
        return 'bg-destructive';
      default:
        return 'bg-muted';
    }
  };

  const getSeverityTextColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'low':
        return 'text-success-foreground';
      case 'medium':
        return 'text-warning-foreground';
      case 'high':
        return 'text-destructive-foreground';
      default:
        return 'text-muted-foreground';
    }
  };

  const backendEventList = Object.values(eventData);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">Power Quality Performance</CardTitle>
          </div>
          <Settings className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedPeriod} onValueChange={handlePeriodChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-6">
            <TabsTrigger value="today" className="text-[10px] sm:text-xs px-1">
              TODAY
            </TabsTrigger>
            <TabsTrigger value="24-hours" className="text-[10px] sm:text-xs px-1">
              LAST 24 HOURS
            </TabsTrigger>
            <TabsTrigger value="this-week" className="text-[10px] sm:text-xs px-1">
              THIS WEEK
            </TabsTrigger>
            <TabsTrigger value="7-days" className="text-[10px] sm:text-xs px-1">
              LAST 7 DAYS
            </TabsTrigger>
            <TabsTrigger value="30-days" className="text-[10px] sm:text-xs px-1">
              LAST 30 DAYS
            </TabsTrigger>
            <TabsTrigger value="12-months" className="text-[10px] sm:text-xs px-1">
              LAST 12 MONTHS
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedPeriod} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Event Flags
              </h3>
              {loadingEvents && (
                <div className="text-xs text-muted-foreground">Loading events…</div>
              )}
              {backendEventList.length === 0 && !loadingEvents && (
                <div className="text-sm text-muted-foreground">No events for the selected period.</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {backendEventList.map((evt) => {
                  const isAlert = evt.count > 0;
                  return (
                    <Card
                      key={evt.label}
                      className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${isAlert ? 'border-l-destructive' : 'border-l-success'}`}
                      onClick={() => {
                        if (evt.timestamps?.length) setActiveEvent(evt);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded ${isAlert ? 'bg-destructive text-destructive-foreground' : 'bg-success text-success-foreground'}`}>
                            <div className="h-3 w-3 rounded-full bg-white/80" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium text-sm">{evt.label}</h3>
                            <div className="mt-2">
                              <Badge variant={isAlert ? 'destructive' : 'secondary'} className="text-xs">
                                {isAlert ? `${evt.count} events` : 'No events'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={!!activeEvent} onOpenChange={() => setActiveEvent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{activeEvent?.label || 'Event'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-auto text-sm">
            {activeEvent?.timestamps && activeEvent.timestamps.length > 0 ? (
              activeEvent.timestamps.map((ts, idx) => (
                <div key={idx} className="border-b pb-1">
                  {new Date(ts).toLocaleString()}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">No timestamps available</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}