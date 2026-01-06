import { useState, useEffect } from "react";
import { Plus, Activity, Zap, Settings, LogOut, Users, Code } from "lucide-react";
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
import { PatchManager } from "./PatchManager";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, Device as ApiDevice } from "@/services/api";

export interface Device extends ApiDevice {
  lastSeen: string;
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

  // Initial fetch
  useEffect(() => {
    loadDevices();
  }, []);

  // Poll only when not viewing a specific device to avoid re-mounting charts
  useEffect(() => {
    if (selectedDevice) return;
    const interval = setInterval(() => {
      loadDevices();
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedDevice]);

  const loadDevices = async () => {
    try {
      const apiDevices = await api.getDevices();
      
      // Fetch latest data for each device to get parameters
      const devicesWithData = await Promise.all(
        apiDevices.map(async (device) => {
          try {
            const latestData = await api.getLatestData(device.id);
            
            // Determine last seen and status based on latest data freshness
            const now = new Date();
            const latestTimestamp = latestData?.timestamp ? new Date(latestData.timestamp) : (device.lastSeen ? new Date(device.lastSeen) : null);
            const isStale = !latestTimestamp || (now.getTime() - latestTimestamp.getTime() > 60_000); // stale if older than 60s
            const derivedStatus: Device['status'] = latestData && !isStale ? 'online' : 'offline';

            if (!latestData) {
              return {
                ...device,
                status: derivedStatus,
                lastSeen: (latestTimestamp || new Date()).toISOString(),
                parameters: {},
              } as Device;
            }
            
            // Extract all numeric parameters from the data
            const parameters: { [key: string]: number } = {};
            Object.keys(latestData).forEach(key => {
              if (key !== 'id' && key !== 'timestamp' && typeof latestData[key as keyof typeof latestData] === 'number') {
                const value = latestData[key as keyof typeof latestData] as number;
                parameters[key] = value;
                // Also store lowercase version for compatibility
                const lowerKey = key.toLowerCase();
                if (lowerKey !== key) {
                  parameters[lowerKey] = value;
                }
              }
            });
            
            return {
              ...device,
              status: derivedStatus,
              lastSeen: (latestTimestamp || new Date(device.lastSeen)).toISOString(),
              parameters,
            } as Device;
          } catch (error) {
            // If error fetching data, return device without parameters
            console.warn(`Failed to fetch data for device ${device.id}:`, error);
            return {
              ...device,
              lastSeen: new Date(device.lastSeen).toISOString(),
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

  const handleAddDevice = async (deviceData: { 
    name: string; 
    ipAddress: string; 
    subnetMask: string;
    slaveAddress: number; 
    breakerRating?: number;
    unitCost?: number;
    type?: string;
    parameterMappings?: Record<string, string>;
  }) => {
    try {
      setIsAddDeviceOpen(false);
      toast.loading('Adding device...', { id: 'add-device' });
      
            const newDevice = await api.createDevice({
              id: Date.now().toString(),
              name: deviceData.name,
              type: deviceData.type || "PM5320",
              ipAddress: deviceData.ipAddress,
              subnetMask: deviceData.subnetMask,
              slaveAddress: deviceData.slaveAddress ?? 1,
              breakerRating: deviceData.breakerRating,
              unitCost: deviceData.unitCost,
              status: "connecting",
              includeInTotalSummary: true,
              parameterMappings: deviceData.parameterMappings,
            });

      // Wait a bit for backend to initialize device table
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Reload devices with retry logic
      let retries = 3;
      while (retries > 0) {
        try {
          await loadDevices();
          toast.success('Device added successfully', { id: 'add-device' });
          break;
        } catch (error) {
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            toast.error('Device added but failed to refresh list. Please refresh the page.', { id: 'add-device' });
          }
        }
      }
      
      // Update device status after backend initializes (set to online deterministically)
      setTimeout(async () => {
        try {
          await api.updateDeviceStatus(newDevice.id, 'online');
          await loadDevices();
        } catch (error) {
          console.warn('Failed to update device status:', error);
        }
      }, 2000);
    } catch (error: any) {
      console.error('Error adding device:', error);
      toast.error(error.message || 'Failed to add device', { id: 'add-device' });
      setIsAddDeviceOpen(true); // Reopen dialog on error
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
        onUpdateDevice={(updated) => {
          // DeviceDetailView already called api.updateDevice, so we just need to:
          // 1. Update the selectedDevice with the updated device (preserve parameters)
          // 2. Update the devices list (preserve parameters)
          setSelectedDevice(prev => {
            if (!prev || prev.id !== updated.id) return prev;
            return {
              ...updated,
              parameters: prev.parameters, // Preserve existing parameters
              lastSeen: prev.lastSeen, // Preserve lastSeen
            } as Device;
          });
          setDevices(prevDevices => 
            prevDevices.map(d => {
              if (d.id === updated.id) {
                return {
                  ...updated,
                  parameters: d.parameters, // Preserve existing parameters
                  lastSeen: d.lastSeen, // Preserve lastSeen
                } as Device;
              }
              return d;
            })
          );
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
              <TabsTrigger value="patches">
                <Code className="w-4 h-4 mr-2" />
                Patches
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

            <TabsContent value="patches">
              <PatchManager />
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