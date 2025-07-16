import { useState } from "react";
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

interface PowerQualityDashboardProps {
  device: Device;
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

export function PowerQualityDashboard({ device }: PowerQualityDashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('30-days');
  const [powerQualityData, setPowerQualityData] = useState<Record<string, PowerQualityEvent>>({});

  // Backend API integration functions
  const handleCardClick = async (cardId: string, apiEndpoint: string) => {
    try {
      console.log(`Fetching data for ${cardId} from ${apiEndpoint}`);
      
      // Backend API call
      const response = await fetch(`${apiEndpoint}/${device.id}?period=${selectedPeriod}`, {
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

  const powerQualityEvents = POWER_QUALITY_CARDS.filter(card => 
    card.type === 'power-quality' || card.type === 'steady-state'
  );
  
  const equipmentStatus = POWER_QUALITY_CARDS.filter(card => 
    card.type === 'equipment'
  );

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
        <Tabs value={selectedPeriod} onValueChange={setSelectedPeriod} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="24-hours">LAST 24 HOURS</TabsTrigger>
            <TabsTrigger value="7-days">LAST 7 DAYS</TabsTrigger>
            <TabsTrigger value="30-days">LAST 30 DAYS</TabsTrigger>
            <TabsTrigger value="12-months">LAST 12 MONTHS</TabsTrigger>
          </TabsList>

          <TabsContent value={selectedPeriod} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Power Quality Events & Steady State Disturbances */}
              <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {powerQualityEvents.map((card) => {
                    const Icon = card.icon;
                    const eventData = powerQualityData[card.id];
                    
                    return (
                      <Card 
                        key={card.id}
                        className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-success"
                        onClick={() => handleCardClick(card.id, card.apiEndpoint)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded ${getSeverityColor(card.severity)} ${getSeverityTextColor(card.severity)}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-medium text-sm">{card.title}</h3>
                              <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                              {eventData && (
                                <div className="mt-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {eventData.count} events
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Corrective Equipment Status */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  CORRECTIVE EQUIPMENT STATUS
                </h3>
                <div className="space-y-3">
                  {equipmentStatus.map((card) => {
                    const Icon = card.icon;
                    const equipmentData = powerQualityData[card.id];
                    
                    return (
                      <Card 
                        key={card.id}
                        className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-success"
                        onClick={() => handleCardClick(card.id, card.apiEndpoint)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded ${getSeverityColor(card.severity)} ${getSeverityTextColor(card.severity)}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-medium text-sm">{card.title}</h3>
                              <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                              {equipmentData && (
                                <div className="mt-2">
                                  <Badge 
                                    variant={equipmentData.severity === 'low' ? 'secondary' : 'destructive'} 
                                    className="text-xs"
                                  >
                                    {equipmentData.severity === 'low' ? 'Operational' : 'Issue Detected'}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}