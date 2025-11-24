import { useState } from "react";
import { ArrowLeft, BarChart3, Download, Settings, Activity, Zap, TrendingUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Device } from "./EnergyDashboard";
import { ParameterChart } from "./ParameterChart";
import { ReportGenerator } from "./ReportGenerator";
import { PowerQualityDashboard } from "./PowerQualityDashboard";

interface DeviceDetailViewProps {
  device: Device;
  onBack: () => void;
  onUpdateDevice: (device: Device) => void;
  onDeleteDevice: (deviceId: string) => void;
}

const AVAILABLE_PARAMETERS = [
  { key: 'V1', label: 'Voltage L1', unit: 'V', group: 'Voltage' },
  { key: 'V2', label: 'Voltage L2', unit: 'V', group: 'Voltage' },
  { key: 'V3', label: 'Voltage L3', unit: 'V', group: 'Voltage' },
  { key: 'I1', label: 'Current L1', unit: 'A', group: 'Current' },
  { key: 'I2', label: 'Current L2', unit: 'A', group: 'Current' },
  { key: 'I3', label: 'Current L3', unit: 'A', group: 'Current' },
  { key: 'P1', label: 'Power L1', unit: 'kW', group: 'Power' },
  { key: 'P2', label: 'Power L2', unit: 'kW', group: 'Power' },
  { key: 'P3', label: 'Power L3', unit: 'kW', group: 'Power' },
  { key: 'Ptotal', label: 'Total Power', unit: 'kW', group: 'Power' },
  { key: 'Harmonics1st', label: 'Harmonics 1st', unit: '%', group: 'Harmonics' },
  { key: 'Harmonics3rd', label: 'Harmonics 3rd', unit: '%', group: 'Harmonics' },
  { key: 'PF1', label: 'Power Factor L1', unit: '', group: 'Power Factor' },
  { key: 'PF2', label: 'Power Factor L2', unit: '', group: 'Power Factor' },
  { key: 'PF3', label: 'Power Factor L3', unit: '', group: 'Power Factor' },
  { key: 'PFavg', label: 'Average Power Factor', unit: '', group: 'Power Factor' },
];

export function DeviceDetailView({ device, onBack, onUpdateDevice, onDeleteDevice }: DeviceDetailViewProps) {
  const [selectedParameters, setSelectedParameters] = useState<string[]>(['Ptotal', 'V1', 'V2', 'V3']);
  const [deviceName, setDeviceName] = useState(device.name);
  const [isEditingName, setIsEditingName] = useState(false);

  const handleNameUpdate = () => {
    const updatedDevice = { ...device, name: deviceName };
    onUpdateDevice(updatedDevice);
    setIsEditingName(false);
  };

  const getStatusIcon = () => {
    switch (device.status) {
      case 'online':
        return <Activity className="w-4 h-4 text-success" />;
      case 'offline':
        return <Activity className="w-4 h-4 text-destructive" />;
      case 'connecting':
        return <Activity className="w-4 h-4 text-warning animate-pulse" />;
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="hover:bg-muted">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="text-2xl font-bold border-2 border-primary"
                  onKeyDown={(e) => e.key === 'Enter' && handleNameUpdate()}
                />
                <Button onClick={handleNameUpdate} size="sm">Save</Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setDeviceName(device.name);
                    setIsEditingName(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 
                  className="text-3xl font-bold cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setIsEditingName(true)}
                >
                  {device.name}
                </h1>
                <Badge className={getStatusColor()}>
                  {getStatusIcon()}
                  <span className="ml-2">{device.status}</span>
                </Badge>
              </div>
            )}
            <p className="text-muted-foreground mt-1">
              {device.type} • {device.ipAddress} • Last seen: {device.lastSeen.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        {device.status === 'online' && Object.keys(device.parameters).length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Power</CardTitle>
                <Zap className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-accent">
                  {device.parameters.Ptotal?.toFixed(1) || '0.0'} kW
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Voltage</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {((device.parameters.V1 + device.parameters.V2 + device.parameters.V3) / 3).toFixed(1)} V
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Current</CardTitle>
                <Activity className="h-4 w-4 text-secondary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-secondary">
                  {((device.parameters.I1 + device.parameters.I2 + device.parameters.I3) / 3).toFixed(1)} A
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Power Factor</CardTitle>
                <BarChart3 className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">
                  {device.parameters.PFavg?.toFixed(2) || '0.00'}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <Tabs defaultValue="monitoring" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="monitoring">Real-time Monitoring</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="monitoring" className="space-y-6">
            {/* Power Quality Performance */}
            <PowerQualityDashboard device={device} />

            {/* Parameter Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Parameter Selection</CardTitle>
                <CardDescription>
                  Select the parameters you want to monitor in real-time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {AVAILABLE_PARAMETERS.map((param) => (
                      <div key={param.key} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={param.key}
                          checked={selectedParameters.includes(param.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedParameters(prev => [...prev, param.key]);
                            } else {
                              setSelectedParameters(prev => prev.filter(p => p !== param.key));
                            }
                          }}
                          className="rounded border-border"
                        />
                        <label htmlFor={param.key} className="text-sm font-medium leading-none">
                          {param.label}
                          {param.unit && <span className="text-muted-foreground"> ({param.unit})</span>}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Charts */}
            {selectedParameters.length > 0 && device.status === 'online' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {selectedParameters.map((paramKey) => {
                  const param = AVAILABLE_PARAMETERS.find(p => p.key === paramKey);
                  if (!param) return null;
                  
                  return (
                    <ParameterChart
                      key={paramKey}
                      parameter={param}
                      value={device.parameters[paramKey] || 0}
                      deviceName={device.name}
                    />
                  );
                })}
              </div>
            )}

            {device.status !== 'online' && (
              <Card className="text-center py-12">
                <CardContent>
                  <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Device Offline</h3>
                  <p className="text-muted-foreground">
                    Connect your device to view real-time monitoring data
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="reports">
            <ReportGenerator device={device} availableParameters={AVAILABLE_PARAMETERS} />
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Device Settings</CardTitle>
                <CardDescription>
                  Configure your device parameters and connection settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Device Type</Label>
                    <div className="p-2 bg-muted rounded text-sm">{device.type}</div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Badge className={getStatusColor()}>
                      {getStatusIcon()}
                      <span className="ml-2">{device.status}</span>
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <Label>IP Address</Label>
                    <div className="p-2 bg-muted rounded text-sm">{device.ipAddress}</div>
                  </div>
                  <div className="space-y-2">
                    <Label>Subnet Mask</Label>
                    <div className="p-2 bg-muted rounded text-sm">{device.subnetMask}</div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline">
                    <Settings className="w-4 h-4 mr-2" />
                    Test Connection
                  </Button>
                  <Button variant="outline">
                    Reconfigure Network
                  </Button>
                </div>

                <div className="pt-6 border-t border-border">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-destructive mb-2">Danger Zone</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Permanently delete this device and all associated historical data. This action cannot be undone.
                      </p>
                    </div>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Device
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the device <strong>{device.name}</strong> and all its historical records from the database. 
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDeleteDevice(device.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete Device
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}