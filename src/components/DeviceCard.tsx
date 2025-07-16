import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Wifi, WifiOff, Loader } from "lucide-react";
import { Device } from "./EnergyDashboard";

interface DeviceCardProps {
  device: Device;
  onClick: () => void;
}

export function DeviceCard({ device, onClick }: DeviceCardProps) {
  const getStatusIcon = () => {
    switch (device.status) {
      case 'online':
        return <Wifi className="w-4 h-4 text-success" />;
      case 'offline':
        return <WifiOff className="w-4 h-4 text-destructive" />;
      case 'connecting':
        return <Loader className="w-4 h-4 text-warning animate-spin" />;
    }
  };

  const getStatusColor = () => {
    switch (device.status) {
      case 'online':
        return 'bg-success text-success-foreground';
      case 'offline':
        return 'bg-destructive text-destructive-foreground';
      case 'connecting':
        return 'bg-warning text-warning-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card 
      className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] group"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg group-hover:text-primary transition-colors">
              {device.name}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <span>{device.type}</span>
              <span>•</span>
              <span>{device.ipAddress}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge className={getStatusColor()}>
              {device.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {device.status === 'online' && Object.keys(device.parameters).length > 0 && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground">Total Power</span>
              <div className="font-medium text-lg text-accent">
                {device.parameters.Ptotal?.toFixed(1) || '0.0'} kW
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Avg Power Factor</span>
              <div className="font-medium text-lg text-secondary">
                {device.parameters.PFavg?.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
          <span>Last seen: {device.lastSeen.toLocaleTimeString()}</span>
          <Activity className="w-3 h-3" />
        </div>
      </CardContent>
    </Card>
  );
}