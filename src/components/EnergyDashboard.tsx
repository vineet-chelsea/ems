import { useState } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface Device {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  subnetMask: string;
  status: 'online' | 'offline' | 'connecting';
  lastSeen: Date;
  parameters: {
    [key: string]: number;
  };
}

const mockDevices: Device[] = [
  {
    id: "1",
    name: "Main Distribution Panel",
    type: "PM5320",
    ipAddress: "192.168.1.100",
    subnetMask: "255.255.255.0",
    status: "online",
    lastSeen: new Date(),
    parameters: {
      V1: 230.5,
      V2: 231.2,
      V3: 229.8,
      I1: 15.2,
      I2: 14.8,
      I3: 15.5,
      P1: 3.5,
      P2: 3.4,
      P3: 3.6,
      Ptotal: 10.5,
      PF1: 0.95,
      PF2: 0.93,
      PF3: 0.96,
      PFavg: 0.95
    }
  }
];

export function EnergyDashboard() {
  const [devices, setDevices] = useState<Device[]>(mockDevices);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const { user, logout, isAdmin, removeDeviceFromUsers } = useAuth();
  const navigate = useNavigate();

  // Filter devices based on user permissions
  const visibleDevices = isAdmin 
    ? devices 
    : devices.filter(d => user?.deviceIds.includes(d.id));

  const onlineDevices = visibleDevices.filter(d => d.status === 'online').length;
  const totalPower = visibleDevices.reduce((sum, device) => sum + (device.parameters.Ptotal || 0), 0);

  const handleAddDevice = (deviceData: { name: string; ipAddress: string; subnetMask: string }) => {
    const newDevice: Device = {
      id: Date.now().toString(),
      name: deviceData.name,
      type: "PM5320",
      ipAddress: deviceData.ipAddress,
      subnetMask: deviceData.subnetMask,
      status: "connecting",
      lastSeen: new Date(),
      parameters: {}
    };

    setDevices(prev => [...prev, newDevice]);
    
    // Simulate connection test
    setTimeout(() => {
      setDevices(prev => prev.map(device => 
        device.id === newDevice.id 
          ? { ...device, status: Math.random() > 0.2 ? 'online' : 'offline' }
          : device
      ));
    }, 2000);
  };

  const handleDeleteDevice = (deviceId: string) => {
    setDevices(prev => prev.filter(d => d.id !== deviceId));
    removeDeviceFromUsers(deviceId);
    setSelectedDevice(null);
    toast.success('Device and all associated records deleted successfully');
  };

  if (selectedDevice) {
    return (
      <DeviceDetailView 
        device={selectedDevice} 
        onBack={() => setSelectedDevice(null)}
        onUpdateDevice={(updated) => {
          setDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
          setSelectedDevice(updated);
        }}
        onDeleteDevice={handleDeleteDevice}
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
              <div className="text-2xl font-bold text-success">Operational</div>
              <p className="text-xs text-muted-foreground">
                All systems running
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
            </TabsList>
            
            <TabsContent value="devices" className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-4">Connected Devices</h2>
                {visibleDevices.length === 0 ? (
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
          </Tabs>
        ) : (
          <div>
            <h2 className="text-xl font-semibold mb-4">Your Devices</h2>
            {visibleDevices.length === 0 ? (
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