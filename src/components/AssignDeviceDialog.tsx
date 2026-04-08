import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Device } from "./EnergyDashboard";

interface AssignDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: Device[];
  assignedDeviceIds: string[];
  onAssign: (deviceId: string) => void;
}

export function AssignDeviceDialog({ open, onOpenChange, devices, assignedDeviceIds, onAssign }: AssignDeviceDialogProps) {
  const availableDevices = devices.filter((d) => !assignedDeviceIds.includes(d.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Assign Device to Node</DialogTitle>
          <DialogDescription>Select a device to add to this group/branch.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {availableDevices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              All devices are already assigned to this node or no devices available.
            </p>
          ) : (
            availableDevices.map((device) => (
              <Button
                key={device.id}
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  onAssign(device.id);
                  onOpenChange(false);
                }}
              >
                <Activity className={`w-4 h-4 ${device.status === "online" ? "text-success" : "text-muted-foreground"}`} />
                <span className="flex-1 text-left">{device.name}</span>
                <Badge variant="secondary" className="text-[10px]">{device.type}</Badge>
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
