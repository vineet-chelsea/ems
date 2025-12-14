import { useState, useEffect } from "react";
import { Plus, Activity, Zap, Settings, LogOut, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceCard } from "./DeviceCard";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { DeviceDetailView } from "./DeviceDetailView";
import { AdminPanel } from "./AdminPanel";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { AutoUpdate } from "./AutoUpdate";
import { AutoStartSettings } from "./AutoStartSettings";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, Device as ApiDevice } from "@/services/api";

export interface Device extends ApiDevice {
  lastSeen: Date;
  parameters: {
    [key: string]: number;
  };
}

export function EnergyDashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user, logout, isAdmin, removeDeviceFromUsers } = useAuth();
  const navigate = useNavigate();

  // Fetch devices from API
  useEffect(() => {
    loadDevices();
    
    // Set up polling to refresh device data every 5 seconds
    const interval = setInterval(() => {
      loadDevices();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadDevices = async () => {
    try {
      const apiDevices = await api.getDevices();
      
      // Fetch latest data for each device to get parameters
      const devicesWithData = await Promise.all(
        apiDevices.map(async (device) => {
          try {
            const latestData = await api.getLatestData(device.id);
            return {
              ...device,
              lastSeen: new Date(device.lastSeen),
              parameters: {
                V1: latestData.V1,
                V2: latestData.V2,
                V3: latestData.V3,
                VR: latestData.VR,
                VY: latestData.VY,
                VB: latestData.VB,
                V: latestData.V,
                Vavg: latestData.Vavg,
                Vpeak: latestData.Vpeak,
                I1: latestData.I1,
                I2: latestData.I2,
                I3: latestData.I3,
                IR: latestData.IR,
                IY: latestData.IY,
                IB: latestData.IB,
                I: latestData.I,
                Iavg: latestData.Iavg,
                Ipeak: latestData.Ipeak,
                P1: latestData.P1,
                P2: latestData.P2,
                P3: latestData.P3,
                Ptotal: latestData.Ptotal,
                PF1: latestData.PF1,
                PF2: latestData.PF2,
                PF3: latestData.PF3,
                PFavg: latestData.PFavg,
                PF: latestData.PF,
                frequency: latestData.frequency,
              } as { [key: string]: number },
            } as Device;
          } catch (error) {
            // If no data available, return device without parameters
            return {
              ...device,
              lastSeen: new Date(device.lastSeen),
              parameters: {},
            } as Device;
          }
        })
      );
      
      setDevices(devicesWithData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading devices:', error);
      toast.error('Failed to load devices. Make sure the backend is running.');
      setLoading(false);
    }
  };

  // Filter devices based on user permissions
  const visibleDevices = isAdmin 
    ? devices 
    : devices.filter(d => user?.deviceIds.includes(d.id));

  const onlineDevices = visibleDevices.filter(d => d.status === 'online').length;
  const totalDevices = visibleDevices.length;
  const isOperational = onlineDevices >= 1;
  const totalPower = visibleDevices
    .filter(d => d.includeInTotalSummary)
    .reduce((sum, device) => sum + (device.parameters.Ptotal || 0), 0);

  const handleAddDevice = async (deviceData: { 
    name: string; 
    ipAddress: string; 
    subnetMask: string;
    slaveAddress: number; 
    type?: string;
    parameterMappings?: Record<string, string>;
  }) => {
    try {
      const newDevice = await api.createDevice({
        id: Date.now().toString(),
        name: deviceData.name,
        type: deviceData.type || "PM5320",
        ipAddress: deviceData.ipAddress,
        subnetMask: deviceData.subnetMask,
        status: "connecting",
        includeInTotalSummary: true,
        parameterMappings: deviceData.parameterMappings,
      });

      toast.success('Device added successfully');
      setIsAddDeviceOpen(false);
      
      // Reload devices
      await loadDevices();
      
      // Simulate connection test - update status after 2 seconds
      setTimeout(async () => {
        const newStatus = Math.random() > 0.2 ? 'online' : 'offline';
        await api.updateDeviceStatus(newDevice.id, newStatus);
        await loadDevices();
      }, 2000);
    } catch (error: any) {
      console.error('Error adding device:', error);
      toast.error(error.message || 'Failed to add device');
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    try {
      await api.deleteDevice(deviceId);
      removeDeviceFromUsers(deviceId);
      setSelectedDevice(null);
      toast.success('Device and all associated records deleted successfully');
      await loadDevices();
    } catch (error: any) {
      console.error('Error deleting device:', error);
      toast.error(error.message || 'Failed to delete device');
    }
  };

  if (selectedDevice) {
    return (
      <DeviceDetailView 
        device={selectedDevice} 
        onBack={() => setSelectedDevice(null)}
        onUpdateDevice={async (updated) => {
          try {
            await api.updateDevice(updated.id, updated);
            await loadDevices();
            const refreshedDevice = devices.find(d => d.id === updated.id);
            if (refreshedDevice) {
              setSelectedDevice(refreshedDevice);
            }
          } catch (error: any) {
            console.error('Error updating device:', error);
            toast.error(error.message || 'Failed to update device');
          }
        }}
        onDeleteDevice={handleDeleteDevice}
        isAdmin={isAdmin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Energy Monitoring System
            </h1>
            <p className="text-muted-foreground mt-1">
              Welcome, {user?.email} ({user?.role})
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button 
                onClick={() => setIsAddDeviceOpen(true)}
                className="bg-gradient-to-r from-primary to-primary-glow hover:shadow-lg transition-all duration-300"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Device
              </Button>
            )}
            <ChangePasswordDialog />
            <Button 
              variant="outline"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Connected Devices</CardTitle>
              <Activity className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onlineDevices}</div>
              <p className="text-xs text-muted-foreground">
                of {visibleDevices.length} visible devices
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Power</CardTitle>
              <Zap className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPower.toFixed(1)} kW</div>
              <p className="text-xs text-muted-foreground">
                Real-time consumption
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Status</CardTitle>
              <Settings className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${isOperational ? 'text-success' : 'text-destructive'}`}>
                {isOperational ? 'Operational' : 'Not Operational'}
              </div>
              <p className="text-xs text-muted-foreground">
                {onlineDevices}/{totalDevices} devices connected
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content with Tabs */}
        {isAdmin ? (
          <Tabs defaultValue="devices" className="w-full">
            <TabsList>
              <TabsTrigger value="devices">
                <Activity className="w-4 h-4 mr-2" />
                Devices
              </TabsTrigger>
              <TabsTrigger value="users">
                <Users className="w-4 h-4 mr-2" />
                User Management
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="devices" className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-4">Connected Devices</h2>
                {loading ? (
                  <Card className="text-center py-12">
                    <CardContent>
                      <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-spin" />
                      <h3 className="text-lg font-medium mb-2">Loading devices...</h3>
                    </CardContent>
                  </Card>
                ) : visibleDevices.length === 0 ? (
                  <Card className="text-center py-12">
                    <CardContent>
                      <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No devices connected</h3>
                      <p className="text-muted-foreground mb-4">
                        Add your first energy monitoring device to get started
                      </p>
                      <Button onClick={() => setIsAddDeviceOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add First Device
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleDevices.map((device) => (
                      <DeviceCard 
                        key={device.id} 
                        device={device} 
                        onClick={() => setSelectedDevice(device)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="users">
              <AdminPanel devices={devices.map(d => ({ id: d.id, name: d.name }))} />
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <AutoStartSettings />
              <AutoUpdate />
            </TabsContent>
          </Tabs>
        ) : (
          <div>
            <h2 className="text-xl font-semibold mb-4">Your Devices</h2>
            {loading ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-medium mb-2">Loading devices...</h3>
                </CardContent>
              </Card>
            ) : visibleDevices.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No devices assigned</h3>
                  <p className="text-muted-foreground">
                    Contact your administrator to get access to devices
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleDevices.map((device) => (
                  <DeviceCard 
                    key={device.id} 
                    device={device} 
                    onClick={() => setSelectedDevice(device)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add Device Dialog */}
        {isAdmin && (
          <AddDeviceDialog 
            open={isAddDeviceOpen}
            onOpenChange={setIsAddDeviceOpen}
            onAddDevice={handleAddDevice}
          />
        )}
      </div>
    </div>
  );
}