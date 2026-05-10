import { type WheelEvent, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Minus, Plus, RefreshCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDeviceTypeDisplayName, getDeviceTypeIcon } from "@/utils/deviceUtils";
import type { Device } from "./EnergyDashboard";
import type { DeviceGroup } from "@/services/api";

const deviceLogoModules = import.meta.glob("../assets/device-logos/*.{png,jpg,jpeg,svg,webp,gif}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const logoByBaseName: Record<string, string> = Object.entries(deviceLogoModules).reduce(
  (acc, [path, src]) => {
    const fileName = path.split("/").pop() || "";
    const base = fileName.replace(/\.[^.]+$/, "").toLowerCase();
    acc[base] = src;
    return acc;
  },
  {} as Record<string, string>
);

interface DeviceTreeViewProps {
  devices: Device[];
  groups: DeviceGroup[];
  isAdmin: boolean;
  onSelectDevice: (device: Device) => void;
  onAddChild: (device: Device) => void;
  onMoveDevice: (device: Device) => void;
  onCreateGroup: () => void;
}

function metricValue(device: Device, keys: string[]) {
  for (const key of keys) {
    const value = device.parameters[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function resolveDeviceLogo(type: string): string | null {
  const normalized = type.toLowerCase();
  const candidates = [
    normalized,
    normalized.replace(/[^a-z0-9]+/g, "_"),
    normalized.replace(/[^a-z0-9]+/g, "-"),
    normalized.replace(/[^a-z0-9]+/g, ""),
  ];

  if (normalized === "pm5320") {
    candidates.push("pm5320", "pm53xx", "pm532x", "pm513x");
  }
  if (normalized === "pm8000") {
    candidates.push("pm8000");
  }
  if (normalized === "micrologic_6e" || normalized === "micrologic 6e") {
    candidates.push("micrologic_6e", "micrologic6e", "micrologic-6e");
  }
  if (normalized === "em6400") {
    candidates.push("em6400");
  }

  for (const key of candidates) {
    if (logoByBaseName[key]) return logoByBaseName[key];
  }
  return null;
}

export function DeviceTreeView({ devices, groups, isAdmin, onSelectDevice, onAddChild, onMoveDevice, onCreateGroup }: DeviceTreeViewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [horizontalZoom, setHorizontalZoom] = useState(1);

  const { groupedRoots, childrenMap } = useMemo(() => {
    const childrenByParent = new Map<string | null, Device[]>();
    const deviceIds = new Set(devices.map((d) => d.id));

    devices.forEach((device) => {
      const parent =
        device.parentDeviceId && deviceIds.has(device.parentDeviceId)
          ? device.parentDeviceId
          : null;
      const list = childrenByParent.get(parent) || [];
      list.push(device);
      childrenByParent.set(parent, list);
    });

    for (const [key, list] of childrenByParent.entries()) {
      childrenByParent.set(
        key,
        [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
      );
    }

    const roots = childrenByParent.get(null) || [];
    const groupBuckets: Record<string, Device[]> = {};
    const unassigned: Device[] = [];

    roots.forEach((root) => {
      if (!root.groupId) {
        unassigned.push(root);
        return;
      }
      if (!groupBuckets[root.groupId]) groupBuckets[root.groupId] = [];
      groupBuckets[root.groupId].push(root);
    });

    const finalGroups = groups
      .filter((group) => (groupBuckets[group.id] || []).length > 0 || isAdmin)
      .map((group) => ({
        id: group.id,
        label: group.name,
        roots: groupBuckets[group.id] || [],
      }));

    if (unassigned.length > 0) {
      finalGroups.push({ id: "unassigned", label: "Unassigned", roots: unassigned });
    }

    return { groupedRoots: finalGroups, childrenMap: childrenByParent };
  }, [devices, groups, isAdmin]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const toggleNode = (deviceId: string) => {
    setExpandedNodes((prev) => ({ ...prev, [deviceId]: !prev[deviceId] }));
  };

  const zoomOut = () => setHorizontalZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))));
  const zoomIn = () => setHorizontalZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))));
  const resetZoom = () => setHorizontalZoom(1);
  const nodeMinWidth = Math.round(270 * horizontalZoom);
  const childGap = Math.round(40 * horizontalZoom);
  const feederGap = Math.round(48 * horizontalZoom);
  const maxRootCount = Math.max(1, ...groupedRoots.map((g) => g.roots.length || 1));

  const zoomToFit = () => {
    const viewportWidth = viewportRef.current?.clientWidth || 0;
    if (!viewportWidth) return;
    const estimatedTreeWidth = maxRootCount * (270 + 48) + 96;
    const target = Math.max(0.4, Math.min(3, viewportWidth / estimatedTreeWidth));
    setHorizontalZoom(Number(target.toFixed(2)));
  };

  const handleCanvasWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setHorizontalZoom((z) => {
      const next = Math.max(0.4, Math.min(3, z + delta));
      return Number(next.toFixed(2));
    });
  };

  const renderNode = (device: Device) => {
    const children = childrenMap.get(device.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes[device.id] ?? true;
    const DeviceIcon = getDeviceTypeIcon(device.type);
    const logoSrc = resolveDeviceLogo(device.type);
    const voltage = metricValue(device, ["Vavg", "V", "vavg", "v"]);
    const current = metricValue(device, ["Iavg", "I", "iavg", "i"]);

    return (
      <div key={device.id} className="flex flex-col items-center" style={{ minWidth: nodeMinWidth + 10 }}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="w-6 h-6 flex items-center justify-center text-muted-foreground border border-black rounded-full bg-white"
            onClick={() => hasChildren && toggleNode(device.id)}
          >
            {hasChildren ? (isExpanded ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />) : null}
          </button>

          <HoverCard>
            <HoverCardTrigger asChild>
              <div className="relative">
                <button
                  type="button"
                  className="text-left border-2 border-black rounded-md px-4 py-3 hover:bg-muted/60 transition-colors bg-background"
                  style={{ minWidth: nodeMinWidth }}
                  onClick={() => onSelectDevice(device)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt={`${device.type} logo`}
                          className="w-12 h-12 object-contain"
                        />
                      ) : (
                        <DeviceIcon className="w-10 h-10 text-primary" />
                      )}
                      <span className="font-semibold text-base">{device.name}</span>
                      <Badge variant="outline">{getDeviceTypeDisplayName(device.type)}</Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">{device.ipAddress}</span>
                  </div>
                </button>
                {hasChildren && isExpanded && (
                  <>
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-5 w-[2px] h-4 bg-black" />
                  </>
                )}
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="w-72">
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">IP:</span> {device.ipAddress}</p>
                <p><span className="text-muted-foreground">Voltage:</span> {voltage !== null ? voltage.toFixed(2) : "N/A"}</p>
                <p><span className="text-muted-foreground">Current:</span> {current !== null ? current.toFixed(2) : "N/A"}</p>
              </div>
            </HoverCardContent>
          </HoverCard>

          {isAdmin && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => onAddChild(device)}>
                <Plus className="w-3 h-3 mr-1" />
                Child
              </Button>
              <Button size="sm" variant="outline" onClick={() => onMoveDevice(device)}>
                <RefreshCcw className="w-3 h-3 mr-1" />
                Assign
              </Button>
            </div>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="relative mt-6 pt-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-6 bg-black" />
            <div className="relative flex items-start justify-center" style={{ gap: childGap }}>
              {children.length > 1 && (
                <div className="absolute top-0 left-16 right-16 h-[2px] bg-black" />
              )}
              {children.map((child) => (
                <div key={child.id} className="relative pt-6">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-6 bg-black" />
                  {renderNode(child)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-between gap-2 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Horizontal Zoom</span>
            <input
              type="range"
              min={0.4}
              max={3}
              step={0.05}
              value={horizontalZoom}
              onChange={(e) => setHorizontalZoom(Number(e.target.value))}
              className="w-40"
            />
          </div>
          <div className="flex gap-2">
          <Button onClick={zoomOut} variant="outline" size="sm">
            <ZoomOut className="w-4 h-4 mr-1" />
            Zoom Out
          </Button>
          <Button onClick={resetZoom} variant="outline" size="sm">
            {Math.round(horizontalZoom * 100)}%
          </Button>
          <Button onClick={zoomIn} variant="outline" size="sm">
            <ZoomIn className="w-4 h-4 mr-1" />
            Zoom In
          </Button>
          <Button onClick={zoomToFit} variant="outline" size="sm">
            Zoom to Fit
          </Button>
          <Button onClick={onCreateGroup} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Create Group
          </Button>
          </div>
        </div>
      )}
      {!isAdmin && (
        <div className="flex justify-between gap-2 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Horizontal Zoom</span>
            <input
              type="range"
              min={0.4}
              max={3}
              step={0.05}
              value={horizontalZoom}
              onChange={(e) => setHorizontalZoom(Number(e.target.value))}
              className="w-40"
            />
          </div>
          <div className="flex gap-2">
          <Button onClick={zoomOut} variant="outline" size="sm">
            <ZoomOut className="w-4 h-4 mr-1" />
            Zoom Out
          </Button>
          <Button onClick={resetZoom} variant="outline" size="sm">
            {Math.round(horizontalZoom * 100)}%
          </Button>
          <Button onClick={zoomIn} variant="outline" size="sm">
            <ZoomIn className="w-4 h-4 mr-1" />
            Zoom In
          </Button>
          <Button onClick={zoomToFit} variant="outline" size="sm">
            Zoom to Fit
          </Button>
          </div>
        </div>
      )}
      {groupedRoots.map((group) => {
        const open = expandedGroups[group.id] ?? true;
        return (
          <Card key={group.id}>
            <CardHeader className="py-3">
              <button
                type="button"
                className="w-full flex items-center justify-between"
                onClick={() => toggleGroup(group.id)}
              >
                <CardTitle className="text-base">{group.label}</CardTitle>
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </CardHeader>
            {open && (
              <CardContent>
                <ScrollArea className="h-[470px] pr-3">
                  <div ref={viewportRef} className="w-full py-2 overflow-x-auto overflow-y-visible">
                    <div onWheel={handleCanvasWheel} className="w-max min-w-full">
                      <div className="flex items-start justify-center px-4" style={{ gap: feederGap, minHeight: "220px" }}>
                        {group.roots.map((root) => renderNode(root))}
                      </div>
                    </div>
                    {group.roots.length === 0 && (
                      <p className="text-sm text-muted-foreground">No root devices in this group yet.</p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

