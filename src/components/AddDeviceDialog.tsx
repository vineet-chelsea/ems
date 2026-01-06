import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Loader, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";

interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddDevice: (device: { 
    name: string; 
    ipAddress: string; 
    subnetMask: string; 
    slaveAddress: number;
    breakerRating?: number;
    unitCost?: number;
    type: string;
    parameterMappings?: Record<string, string>;
  }) => void;
}

export function AddDeviceDialog({ open, onOpenChange, onAddDevice }: AddDeviceDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "PM5320",
    ipAddress: "192.168.0.5",
    subnetMask: "255.255.255.0",
    slaveAddress: 1,
    breakerRating: 0,
    unitCost: 0,
    // Micrologic 6E protection settings
    protectionIr: undefined as number | undefined,
    protectionTr: undefined as number | undefined,
    protectionIsd: undefined as number | undefined,
    protectionTsd: undefined as number | undefined,
    protectionIi: undefined as number | undefined,
    protectionIg: undefined as string | undefined,
    protectionTg: undefined as number | undefined,
  });
  const [pingStatus, setPingStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePingTest = async () => {
    if (!formData.ipAddress) {
      toast.error('Please enter an IP address first');
      return;
    }

    setPingStatus('testing');
    
    try {
      const result = await api.testDeviceConnection(
        formData.ipAddress,
        formData.slaveAddress ?? 1
      );
      
      if (result.success) {
        setPingStatus('success');
        toast.success(result.message || `Successfully connected to ${formData.ipAddress}`);
      } else {
        setPingStatus('failed');
        toast.error(result.error || 'Connection test failed');
      }
    } catch (error: any) {
      setPingStatus('failed');
      const errorMessage = error.message || 'Failed to test connection';
      toast.error(errorMessage);
      console.error('Connection test error:', error);
    }
  };


  const handleSubmit = async () => {
    if (!formData.name || !formData.ipAddress) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    
    try {
      onAddDevice({
        name: formData.name,
        ipAddress: formData.ipAddress,
        subnetMask: "255.255.255.0",
        slaveAddress: formData.slaveAddress ?? 1,
        breakerRating: formData.breakerRating || undefined,
        unitCost: formData.unitCost || undefined,
        type: formData.type,
        // Micrologic 6E protection settings (only include if type is MICROLOGIC_6E)
        ...(formData.type === 'MICROLOGIC_6E' ? {
          protectionIr: formData.protectionIr,
          protectionTr: formData.protectionTr,
          protectionIsd: formData.protectionIsd,
          protectionTsd: formData.protectionTsd,
          protectionIi: formData.protectionIi,
          protectionIg: formData.protectionIg,
          protectionTg: formData.protectionTg,
        } : {}),
      });

      // Reset form
      setFormData({
        name: "",
        type: "PM5320", 
        ipAddress: "192.168.0.5",
        subnetMask: "255.255.255.0",
        slaveAddress: 1,
        breakerRating: 0,
        unitCost: 0,
        protectionIr: undefined,
        protectionTr: undefined,
        protectionIsd: undefined,
        protectionTsd: undefined,
        protectionIi: undefined,
        protectionIg: undefined,
        protectionTg: undefined,
      });
      setPingStatus('idle');
      setIsSubmitting(false);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to add device');
      setIsSubmitting(false);
    }
  };

  const getPingStatusIcon = () => {
    switch (pingStatus) {
      case 'testing':
        return <Loader className="w-4 h-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Wifi className="w-4 h-4" />;
    }
  };

  const getPingStatusColor = () => {
    switch (pingStatus) {
      case 'testing':
        return 'bg-warning text-warning-foreground';
      case 'success':
        return 'bg-success text-success-foreground';
      case 'failed':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-primary" />
            Add New Device
          </DialogTitle>
          <DialogDescription>
            Configure a new energy monitoring device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Device Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="device-type">Device Type</Label>
            <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select device type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PM5320">PM513x,PM532x,PM53xx Power Meter</SelectItem>
                <SelectItem value="PM8000">PM8000 Power Meter</SelectItem>
                <SelectItem value="MICROLOGIC_6E">Micrologic 6E</SelectItem>
                <SelectItem value="EM6400">EM6400</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Device Name */}
          <div className="space-y-2">
            <Label htmlFor="device-name">Device Name</Label>
            <Input
              id="device-name"
              placeholder="e.g., Main Distribution Panel"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          {/* Network Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ip-address">IP Address</Label>
              <Input
                id="ip-address"
                placeholder="192.168.0.5"
                value={formData.ipAddress}
                onChange={(e) => setFormData(prev => ({ ...prev, ipAddress: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subnet-mask">Subnet Mask</Label>
              <Input
                id="subnet-mask"
                value="255.255.255.0"
                disabled
                className="bg-muted cursor-not-allowed"
              />
            </div>
          </div>

          {/* Slave Address */}
          <div className="space-y-2">
            <Label htmlFor="slave-address">Modbus Slave Address (0-255)</Label>
            <Input
              id="slave-address"
              type="number"
              min="0"
              max="255"
              placeholder="1"
              value={formData.slaveAddress}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 0;
                const clampedValue = Math.max(0, Math.min(255, value));
                setFormData(prev => ({ ...prev, slaveAddress: clampedValue }));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Modbus unit/slave ID (typically 1-247, default: 1)
            </p>
          </div>

          {/* Breaker Rating + Unit Cost */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="breaker-rating">Breaker Rating (A)</Label>
              <Input
                id="breaker-rating"
                type="number"
                min="0"
                placeholder="e.g., 100"
                value={formData.breakerRating}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setFormData(prev => ({ ...prev, breakerRating: Math.max(0, value) }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-cost">Unit Cost (Rs/kWh)</Label>
              <Input
                id="unit-cost"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g., 9.50"
                value={formData.unitCost}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  setFormData(prev => ({ ...prev, unitCost: isNaN(value) ? 0 : Math.max(0, value) }));
                }}
              />
            </div>
          </div>

          {/* Micrologic 6E Protection Settings */}
          {formData.type === 'MICROLOGIC_6E' && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <Label className="text-base font-semibold">Protection Settings</Label>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Ir (Long Time Overload) */}
                <div className="space-y-2">
                  <Label htmlFor="protection-ir">Ir (Long Time Overload)</Label>
                  <Input
                    id="protection-ir"
                    type="number"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    placeholder="0.1 - 1.0"
                    value={formData.protectionIr ?? ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value >= 0.1 && value <= 1.0) {
                        setFormData(prev => ({ ...prev, protectionIr: value }));
                      } else if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, protectionIr: undefined }));
                      }
                    }}
                  />
                </div>

                {/* tr (Long time overload duration) */}
                <div className="space-y-2">
                  <Label htmlFor="protection-tr">tr (Long Time Overload Duration) (s)</Label>
                  <Input
                    id="protection-tr"
                    type="number"
                    min="0.5"
                    max="25.0"
                    step="0.1"
                    placeholder="0.5 - 25.0"
                    value={formData.protectionTr ?? ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value >= 0.5 && value <= 25.0) {
                        setFormData(prev => ({ ...prev, protectionTr: value }));
                      } else if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, protectionTr: undefined }));
                      }
                    }}
                  />
                </div>

                {/* Isd (Short Time) */}
                <div className="space-y-2">
                  <Label htmlFor="protection-isd">Isd (Short Time)</Label>
                  <Input
                    id="protection-isd"
                    type="number"
                    min="1.0"
                    max="10.0"
                    step="0.5"
                    placeholder="1.0 - 10.0"
                    value={formData.protectionIsd ?? ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value >= 1.0 && value <= 10.0) {
                        setFormData(prev => ({ ...prev, protectionIsd: value }));
                      } else if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, protectionIsd: undefined }));
                      }
                    }}
                  />
                </div>

                {/* tsd */}
                <div className="space-y-2">
                  <Label htmlFor="protection-tsd">tsd (s)</Label>
                  <Input
                    id="protection-tsd"
                    type="number"
                    min="0.1"
                    max="0.4"
                    step="0.1"
                    placeholder="0.1 - 0.4"
                    value={formData.protectionTsd ?? ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value >= 0.1 && value <= 0.4) {
                        setFormData(prev => ({ ...prev, protectionTsd: value }));
                      } else if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, protectionTsd: undefined }));
                      }
                    }}
                  />
                </div>

                {/* Ii (Instantaneous) */}
                <div className="space-y-2">
                  <Label htmlFor="protection-ii">Ii (Instantaneous)</Label>
                  <Input
                    id="protection-ii"
                    type="number"
                    min="2.0"
                    max="10.0"
                    step="0.1"
                    placeholder="2.0 - 10.0"
                    value={formData.protectionIi ?? ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value >= 2.0 && value <= 10.0) {
                        setFormData(prev => ({ ...prev, protectionIi: value }));
                      } else if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, protectionIi: undefined }));
                      }
                    }}
                  />
                </div>

                {/* Ig */}
                <div className="space-y-2">
                  <Label htmlFor="protection-ig">Ig</Label>
                  <Select
                    value={formData.protectionIg ?? undefined}
                    onValueChange={(value) => {
                      // Use "none" as a special value to represent undefined
                      if (value === 'none') {
                        setFormData(prev => ({ ...prev, protectionIg: undefined }));
                      } else {
                        setFormData(prev => ({ ...prev, protectionIg: value as 'A' | 'B' | 'C' | 'D' | 'E' | 'F' }));
                      }
                    }}
                  >
                    <SelectTrigger id="protection-ig">
                      <SelectValue placeholder="Select Ig" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="B">B</SelectItem>
                      <SelectItem value="C">C</SelectItem>
                      <SelectItem value="D">D</SelectItem>
                      <SelectItem value="E">E</SelectItem>
                      <SelectItem value="F">F</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* tg(s) */}
                <div className="space-y-2">
                  <Label htmlFor="protection-tg">tg(s)</Label>
                  <Input
                    id="protection-tg"
                    type="number"
                    min="0.1"
                    max="0.4"
                    step="0.1"
                    placeholder="0.1 - 0.4"
                    value={formData.protectionTg ?? ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value >= 0.1 && value <= 0.4) {
                        setFormData(prev => ({ ...prev, protectionTg: value }));
                      } else if (e.target.value === '') {
                        setFormData(prev => ({ ...prev, protectionTg: undefined }));
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Connection Test */}
          <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <Label>Connection Test</Label>
              <Badge className={getPingStatusColor()}>
                {getPingStatusIcon()}
                <span className="ml-2">
                  {pingStatus === 'idle' && 'Not tested'}
                  {pingStatus === 'testing' && 'Testing...'}
                  {pingStatus === 'success' && 'Connected'}
                  {pingStatus === 'failed' && 'Failed'}
                </span>
              </Badge>
            </div>
            <Button 
              variant="outline" 
              onClick={handlePingTest}
              disabled={pingStatus === 'testing' || !formData.ipAddress}
              className="w-full"
            >
              {pingStatus === 'testing' ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            onOpenChange(false);
          }}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!formData.name || !formData.ipAddress || isSubmitting}
            className="bg-gradient-to-r from-primary to-primary-glow"
          >
            {isSubmitting ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Adding Device...
              </>
            ) : (
              'Add Device'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
