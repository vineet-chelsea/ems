import { useState } from "react";
import { 
  ChevronRight, ChevronDown, FolderPlus, FolderMinus, Plus, Trash2, 
  Edit2, Check, X, Activity, Zap 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { Device } from "./EnergyDashboard";

export interface TreeNode {
  id: string;
  name: string;
  type: "group" | "branch";
  children: TreeNode[];
  deviceIds: string[];
  expanded?: boolean;
}

interface DeviceTreeProps {
  tree: TreeNode[];
  devices: Device[];
  isAdmin: boolean;
  onTreeChange: (tree: TreeNode[]) => void;
  onDeviceClick: (device: Device) => void;
  onAssignDevice: (nodeId: string) => void;
}

let nodeCounter = 0;
function generateNodeId() {
  nodeCounter += 1;
  return `node-${Date.now()}-${nodeCounter}`;
}

export function DeviceTree({ tree, devices, isAdmin, onTreeChange, onDeviceClick, onAssignDevice }: DeviceTreeProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const findAndUpdate = (nodes: TreeNode[], id: string, updater: (node: TreeNode) => TreeNode | null): TreeNode[] => {
    return nodes.reduce<TreeNode[]>((acc, node) => {
      if (node.id === id) {
        const result = updater(node);
        if (result) acc.push(result);
      } else {
        acc.push({ ...node, children: findAndUpdate(node.children, id, updater) });
      }
      return acc;
    }, []);
  };

  const toggleExpand = (id: string) => {
    onTreeChange(findAndUpdate(tree, id, (n) => ({ ...n, expanded: !n.expanded })));
  };

  const addChild = (parentId: string | null) => {
    const newNode: TreeNode = {
      id: generateNodeId(),
      name: "New Group",
      type: parentId ? "branch" : "group",
      children: [],
      deviceIds: [],
      expanded: true,
    };

    if (!parentId) {
      onTreeChange([...tree, newNode]);
    } else {
      onTreeChange(findAndUpdate(tree, parentId, (n) => ({
        ...n,
        expanded: true,
        children: [...n.children, { ...newNode, type: "branch", name: "New Branch" }],
      })));
    }
    toast.success(`Added ${parentId ? 'branch' : 'group'}`);
  };

  const deleteNode = (id: string) => {
    onTreeChange(findAndUpdate(tree, id, () => null));
    toast.success("Deleted successfully");
  };

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const confirmRename = (id: string) => {
    if (!editName.trim()) return;
    onTreeChange(findAndUpdate(tree, id, (n) => ({ ...n, name: editName.trim() })));
    setEditingId(null);
    setEditName("");
  };

  const removeDeviceFromNode = (nodeId: string, deviceId: string) => {
    onTreeChange(findAndUpdate(tree, nodeId, (n) => ({
      ...n,
      deviceIds: n.deviceIds.filter((d) => d !== deviceId),
    })));
  };

  const getDevice = (id: string) => devices.find((d) => d.id === id);

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const nodeDevices = node.deviceIds.map(getDevice).filter(Boolean) as Device[];
    const hasChildren = node.children.length > 0 || nodeDevices.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div
          className="flex items-center gap-1 py-1.5 px-2 rounded-md hover:bg-muted/60 group transition-colors"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          {/* Expand/collapse */}
          <button
            onClick={() => toggleExpand(node.id)}
            className="p-0.5 rounded hover:bg-muted"
          >
            {node.expanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {/* Icon */}
          <Zap className={`w-4 h-4 ${node.type === "group" ? "text-primary" : "text-accent"}`} />

          {/* Name or edit input */}
          {editingId === node.id ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-6 text-sm py-0 px-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmRename(node.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
              <button onClick={() => confirmRename(node.id)} className="p-0.5 text-success hover:bg-muted rounded">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setEditingId(null)} className="p-0.5 text-destructive hover:bg-muted rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span
              className="text-sm font-medium flex-1 cursor-pointer"
              onDoubleClick={() => isAdmin && startRename(node.id, node.name)}
            >
              {node.name}
            </span>
          )}

          {/* Badges */}
          <Badge variant="outline" className="text-xs px-1.5 py-0">
            {nodeDevices.length} device{nodeDevices.length !== 1 ? "s" : ""}
          </Badge>

          {/* Actions - visible on hover or always for admin */}
          {isAdmin && editingId !== node.id && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => startRename(node.id, node.name)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Rename"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => addChild(node.id)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Add sub-branch"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onAssignDevice(node.id)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Add device to this node"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{node.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove this {node.type} and all its sub-branches. Devices will be unassigned but not deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteNode(node.id)} className="bg-destructive text-destructive-foreground">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {/* Children & Devices */}
        {node.expanded && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
            {nodeDevices.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 cursor-pointer group/device transition-colors"
                style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}
                onClick={() => onDeviceClick(device)}
              >
                <Activity className={`w-3.5 h-3.5 ${device.status === "online" ? "text-success" : "text-muted-foreground"}`} />
                <span className="text-sm flex-1">{device.name}</span>
                <Badge
                  variant={device.status === "online" ? "default" : "secondary"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {device.status}
                </Badge>
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeDeviceFromNode(node.id, device.id);
                    }}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover/device:opacity-100 transition-opacity"
                    title="Remove from this group"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Collect unassigned devices
  const allAssignedIds = new Set<string>();
  const collectAssigned = (nodes: TreeNode[]) => {
    nodes.forEach((n) => {
      n.deviceIds.forEach((id) => allAssignedIds.add(id));
      collectAssigned(n.children);
    });
  };
  collectAssigned(tree);
  const unassignedDevices = devices.filter((d) => !allAssignedIds.has(d.id));

  return (
    <div className="space-y-4">
      {/* Top-level add group button */}
      {isAdmin && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => addChild(null)}>
            <FolderPlus className="w-4 h-4 mr-2" />
            Add Group
          </Button>
        </div>
      )}

      {/* Tree */}
      <Card>
        <CardContent className="p-3">
          {tree.length === 0 && unassignedDevices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No groups yet. Create a group to organize your devices.</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {tree.map((node) => renderNode(node))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unassigned devices */}
      {unassignedDevices.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Unassigned Devices</p>
            <div className="space-y-0.5">
              {unassignedDevices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => onDeviceClick(device)}
                >
                  <Activity className={`w-3.5 h-3.5 ${device.status === "online" ? "text-success" : "text-muted-foreground"}`} />
                  <span className="text-sm flex-1">{device.name}</span>
                  <Badge variant={device.status === "online" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                    {device.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
