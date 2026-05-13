import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api } from "@/services/api";
import type { Device } from "./EnergyDashboard";
import {
  buildComparisonRowDefs,
  buildKeyParameterRowMap,
  formatKeyParameterValue,
  type KeyParameterRow,
} from "./KeyParametersTables";

const POLL_MS = 5000;
const MAX_COMPARE_DEVICES = 12;

function latestDataToParameters(latestData: Record<string, unknown> | null): Record<string, number> {
  if (!latestData) return {};
  const parameters: Record<string, number> = {};

  const toNum = (raw: unknown): number | null => {
    if (typeof raw === "number" && isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "" && !isNaN(Number(raw))) {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  Object.keys(latestData).forEach((key) => {
    if (key === "id" || key === "timestamp") return;
    const raw = latestData[key];
    const numVal = toNum(raw);
    if (numVal === null) return;

    parameters[key] = numVal;
    const lowerKey = key.toLowerCase();
    if (lowerKey !== key) parameters[lowerKey] = numVal;
    const sanitizedKey = lowerKey.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_");
    if (sanitizedKey !== key && sanitizedKey !== lowerKey) parameters[sanitizedKey] = numVal;
  });

  return parameters;
}

type MultiDeviceKeyParametersCompareProps = {
  visibleDevices: Device[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  onBack: () => void;
};

export function MultiDeviceKeyParametersCompare({
  visibleDevices,
  selectedIds,
  onSelectedIdsChange,
  onBack,
}: MultiDeviceKeyParametersCompareProps) {
  const [paramsByDeviceId, setParamsByDeviceId] = useState<Record<string, Record<string, number>>>({});
  const [refreshing, setRefreshing] = useState(false);

  const selectedDevices = useMemo(
    () => selectedIds.map((id) => visibleDevices.find((d) => d.id === id)).filter((d): d is Device => Boolean(d)),
    [visibleDevices, selectedIds]
  );

  const rowDefs = useMemo(
    () => buildComparisonRowDefs(selectedDevices.map((d) => d.type)),
    [selectedDevices]
  );

  const rowMapByDeviceId = useMemo(() => {
    const m: Record<string, Map<string, KeyParameterRow>> = {};
    for (const d of selectedDevices) {
      const params = paramsByDeviceId[d.id] ?? d.parameters ?? {};
      m[d.id] = buildKeyParameterRowMap(d.type, params);
    }
    return m;
  }, [selectedDevices, paramsByDeviceId]);

  const refreshLatest = useCallback(async () => {
    if (selectedIds.length === 0) {
      setParamsByDeviceId({});
      return;
    }
    setRefreshing(true);
    try {
      const entries = await Promise.all(
        selectedIds.map(async (id) => {
          try {
            const latest = await api.getLatestData(id);
            return [id, latestDataToParameters(latest as Record<string, unknown> | null)] as const;
          } catch {
            return [id, {}] as const;
          }
        })
      );
      setParamsByDeviceId(Object.fromEntries(entries));
    } finally {
      setRefreshing(false);
    }
  }, [selectedIds]);

  useEffect(() => {
    void refreshLatest();
  }, [refreshLatest]);

  useEffect(() => {
    if (selectedIds.length === 0) return;
    const t = setInterval(() => void refreshLatest(), POLL_MS);
    return () => clearInterval(t);
  }, [selectedIds.length, refreshLatest]);

  const toggleDevice = (deviceId: string, checked: boolean) => {
    if (checked) {
      if (selectedIds.includes(deviceId)) return;
      if (selectedIds.length >= MAX_COMPARE_DEVICES) return;
      onSelectedIdsChange([...selectedIds, deviceId]);
    } else {
      onSelectedIdsChange(selectedIds.filter((id) => id !== deviceId));
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Key parameters comparison</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Same top-table parameters as real-time monitoring. Up to {MAX_COMPARE_DEVICES} devices; data refreshes
                every {POLL_MS / 1000}s.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void refreshLatest()} disabled={refreshing || selectedIds.length === 0}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select devices</CardTitle>
            <CardDescription>Check any combination of devices you can access ({selectedIds.length} selected).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleDevices.map((d) => {
                const checked = selectedIds.includes(d.id);
                const disabled = !checked && selectedIds.length >= MAX_COMPARE_DEVICES;
                return (
                  <div key={d.id} className="flex items-center space-x-2 rounded-md border p-3">
                    <Checkbox
                      id={`cmp-${d.id}`}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(v) => toggleDevice(d.id, v === true)}
                    />
                    <Label htmlFor={`cmp-${d.id}`} className="flex-1 cursor-pointer text-sm font-medium leading-tight">
                      {d.name}
                      <span className="block text-xs font-normal text-muted-foreground">{d.type}</span>
                    </Label>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedDevices.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Select at least one device to compare key parameters.
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Comparison</CardTitle>
              <CardDescription>Rows match Voltages, Current, Power, Energy, and General key tables.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left py-3 px-4 font-semibold sticky left-0 bg-muted/50 z-10 border-r min-w-[140px]">
                        Group
                      </th>
                      <th className="text-left py-3 px-4 font-semibold sticky left-[140px] bg-muted/50 z-10 border-r min-w-[120px]">
                        Parameter
                      </th>
                      {selectedDevices.map((d) => (
                        <th key={d.id} className="text-right py-3 px-3 font-semibold min-w-[110px] whitespace-nowrap">
                          <div className="max-w-[160px] truncate ml-auto" title={d.name}>
                            {d.name}
                          </div>
                          <div className="text-xs font-normal text-muted-foreground truncate">{d.status}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowDefs.map((def, idx) => (
                      <tr
                        key={`${def.groupTitle}-${def.label}-${idx}`}
                        className="border-b border-border/60 even:bg-muted/20"
                      >
                        <td className="py-2 px-4 text-xs text-muted-foreground sticky left-0 bg-background z-[1] border-r">
                          {def.groupTitle}
                        </td>
                        <td className="py-2 px-4 font-medium sticky left-[140px] bg-background z-[1] border-r text-xs">
                          {def.label}
                        </td>
                        {selectedDevices.map((d) => {
                          const row =
                            rowMapByDeviceId[d.id]?.get(def.label) ?? {
                              label: def.label,
                              value: undefined as number | undefined,
                              unit: def.unit,
                            };
                          return (
                            <td
                              key={d.id}
                              className="py-2 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap"
                            >
                              {formatKeyParameterValue(row.value, row.unit, row.label, row.alreadyScaled)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
