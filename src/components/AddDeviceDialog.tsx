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

interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddDevice: (device: { name: string; ipAddress: string; subnetMask: string }) => void;
}

export function AddDeviceDialog({ open, onOpenChange, onAddDevice }: AddDeviceDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "PM5320",
    ipAddress: "192.168.1.100",
    subnetMask: "255.255.255.0"
  });
  const [pingStatus, setPingStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePingTest = async () => {
    setPingStatus('testing');
    
    // Simulate ping test
    setTimeout(() => {
      const success = Math.random() > 0.3; // 70% success rate for demo
      setPingStatus(success ? 'success' : 'failed');
    }, 2000);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.ipAddress || !formData.subnetMask) {
      return;
    }

    setIsSubmitting(true);
    
    // Add the device
    onAddDevice({
      name: formData.name,
      ipAddress: formData.ipAddress,
      subnetMask: formData.subnetMask
    });

    // Reset form
    setFormData({
      name: "",
      type: "PM5320", 
      ipAddress: "192.168.1.100",
      subnetMask: "255.255.255.0"
    });
    setPingStatus('idle');
    setIsSubmitting(false);
    onOpenChange(false);
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-primary" />
            Add New Device
          </DialogTitle>
          <DialogDescription>
            Configure a new energy monitoring device. Test the connection before adding.
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
                <SelectItem value="PM5320">PM5320 Power Meter</SelectItem>
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
                placeholder="192.168.1.100"
                value={formData.ipAddress}
                onChange={(e) => setFormData(prev => ({ ...prev, ipAddress: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subnet-mask">Subnet Mask</Label>
              <Input
                id="subnet-mask"
                placeholder="255.255.255.0"
                value={formData.subnetMask}
                onChange={(e) => setFormData(prev => ({ ...prev, subnetMask: e.target.value }))}
              />
            </div>
          </div>

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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!formData.name || !formData.ipAddress || !formData.subnetMask || isSubmitting}
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