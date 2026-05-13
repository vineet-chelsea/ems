import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_KEY_PARAMETERS_MAPPING,
  KEY_PARAMETERS_BY_DEVICE,
  KEY_PARAMETERS_GROUPS,
  KEY_PARAMETERS_LABELS,
  KEY_PARAMETERS_LABEL_UNITS,
  KEY_PARAMETERS_MICROLOGIC_6E_EXTRA,
  type KeyParametersMapping,
} from "@/lib/keyParametersConfig";

export type KeyParameterRow = {
  label: string;
  value: number | undefined;
  unit: string;
  alreadyScaled?: boolean;
};

export type KeyParameterGroupBlock = { title: string; rows: KeyParameterRow[] };

function toNum(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function getVal(currentParameters: Record<string, number>, key: string): number | undefined {
  let v: unknown = currentParameters[key] ?? currentParameters[key.toLowerCase()];
  let out = toNum(v);
  if (out !== undefined) return out;
  const sanitized = key.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
  out = toNum(currentParameters[sanitized]);
  if (out !== undefined) return out;
  const matchKey = Object.keys(currentParameters).find(
    (k) => k.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_') === sanitized
  );
  return matchKey !== undefined ? toNum(currentParameters[matchKey]) : undefined;
}

export function formatKeyParameterValue(
  val: number | undefined,
  unit: string,
  label?: string,
  alreadyScaled = false
): string {
  if (val === undefined) return '—';
  if (label === 'Breaker ON/OFF' || label === 'TRIP Status' || label === 'Spring Charged') {
    return val === 1 ? 'ON' : val === 0 ? 'OFF' : String(val);
  }
  if (unit === '%' || unit === '') return val.toFixed(2);
  if (unit === 'V' || unit === 'A') return `${val.toFixed(1)} ${unit}`;
  if (unit === 'Hz') return `${val.toFixed(2)} Hz`;
  if (unit === 'W') return alreadyScaled ? `${val.toFixed(2)} kW` : `${val.toFixed(2)} kW`;
  if (unit === 'kVA') return alreadyScaled ? `${val.toFixed(2)} kVA` : `${val.toFixed(2)} kVA`;
  if (unit === 'var') return alreadyScaled ? `${val.toFixed(2)} kVAR` : `${val.toFixed(2)} kVAR`;
  if (unit === 'kWh' || unit === 'kVAh' || unit === 'kVARh') return `${val.toFixed(1)} ${unit}`;
  return `${val.toFixed(1)}`;
}

export function buildKeyParameterGroupBlocks(
  deviceType: string,
  currentParameters: Record<string, number>
): KeyParameterGroupBlock[] {
  const keySpec = KEY_PARAMETERS_BY_DEVICE[deviceType] ?? {};
  const mapping: KeyParametersMapping = { ...DEFAULT_KEY_PARAMETERS_MAPPING, ...keySpec };
  const standardLabels = [...KEY_PARAMETERS_LABELS];
  const extraLabels = deviceType === 'MICROLOGIC_6E' ? [...KEY_PARAMETERS_MICROLOGIC_6E_EXTRA] : [];
  const allLabels = [...standardLabels, ...extraLabels];
  const powerEnergyLabels = ['kW', 'KVA', 'kVAR', 'kWh', 'KVAh', 'kVARh'];
  const powerEnergyLabels2 = ['kW', 'KVA', 'kVAR'];
  const rows: KeyParameterRow[] = allLabels.map((label) => {
    const paramKey = mapping[label];
    let value = paramKey && paramKey.trim() ? getVal(currentParameters, paramKey) : undefined;
    const isMicrologic6EPowerEnergy = deviceType === 'MICROLOGIC_6E' && powerEnergyLabels.includes(label);
    if (isMicrologic6EPowerEnergy && value !== undefined) {
      value = value / 1000;
    }
    const isPM8000energy = deviceType === 'PM8000' && powerEnergyLabels2.includes(label);
    if (isPM8000energy && value !== undefined) {
      value = value / 1000;
    }
    const unit = KEY_PARAMETERS_LABEL_UNITS[label] ?? '';
    return { label, value, unit, alreadyScaled: isMicrologic6EPowerEnergy };
  });

  const generalLabels = [...KEY_PARAMETERS_GROUPS.General];
  if (deviceType === 'MICROLOGIC_6E') generalLabels.push(...KEY_PARAMETERS_MICROLOGIC_6E_EXTRA);

  const groupConfigs: { title: string; labels: string[] }[] = [
    { title: 'Voltages', labels: [...KEY_PARAMETERS_GROUPS.Voltages] },
    { title: 'Current', labels: [...KEY_PARAMETERS_GROUPS.Current] },
    { title: 'Power', labels: [...KEY_PARAMETERS_GROUPS.Power] },
    { title: 'Energy', labels: [...KEY_PARAMETERS_GROUPS.Energy] },
    { title: 'General', labels: generalLabels },
  ];

  return groupConfigs
    .map(({ title, labels }) => {
      const groupRows = rows.filter((r) => labels.includes(r.label));
      if (groupRows.length === 0) return null;
      return { title, rows: groupRows };
    })
    .filter((g): g is KeyParameterGroupBlock => g !== null);
}

type KeyParametersTablesProps = {
  deviceType: string;
  currentParameters: Record<string, number>;
  /** Optional device type label in card description (defaults to deviceType) */
  deviceTypeLabel?: string;
};

export function KeyParametersTables({ deviceType, currentParameters, deviceTypeLabel }: KeyParametersTablesProps) {
  const blocks = buildKeyParameterGroupBlocks(deviceType, currentParameters);
  const paramCount = Object.keys(currentParameters).length;
  const typeLabel = deviceTypeLabel ?? deviceType;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {blocks.map(({ title, rows }) => (
        <Card key={title} className="overflow-hidden shadow-sm w-full min-w-0">
          <CardHeader className="pb-2 pt-3 px-4 border-b border-border/50 bg-muted/20">
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {paramCount === 0 ? 'No data' : typeLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-0">
            <div className="rounded-b-lg overflow-hidden">
              <table className="w-full table-auto">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left py-2.5 px-4 font-semibold text-foreground/90 text-xs">Parameter</th>
                    <th className="text-right py-2.5 px-4 font-semibold text-foreground/90 text-xs">Value</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border/60">
                  {rows.map((r, i) => (
                    <tr
                      key={`${title}-${r.label}-${i}`}
                      className="hover:bg-green-100/50 dark:hover:bg-green-900/20 transition-colors even:bg-green-50/80 dark:even:bg-green-950/40 odd:bg-card"
                    >
                      <td className="py-2 px-4 text-xs font-medium text-foreground/90">{r.label}</td>
                      <td className="py-2 px-4 text-right text-sm font-bold font-mono text-foreground tabular-nums tracking-tight">
                        {formatKeyParameterValue(r.value, r.unit, r.label, r.alreadyScaled)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Flat list of { groupTitle, label, unit } for cross-device tables (Micrologic-only rows included when any device needs them). */
export function buildComparisonRowDefs(deviceTypes: string[]): { groupTitle: string; label: string; unit: string }[] {
  const includeMicrologicExtras = deviceTypes.some((t) => t === 'MICROLOGIC_6E');
  const generalLabels = [...KEY_PARAMETERS_GROUPS.General];
  if (includeMicrologicExtras) generalLabels.push(...KEY_PARAMETERS_MICROLOGIC_6E_EXTRA);

  const groupConfigs: { title: string; labels: readonly string[] }[] = [
    { title: 'Voltages', labels: KEY_PARAMETERS_GROUPS.Voltages },
    { title: 'Current', labels: KEY_PARAMETERS_GROUPS.Current },
    { title: 'Power', labels: KEY_PARAMETERS_GROUPS.Power },
    { title: 'Energy', labels: KEY_PARAMETERS_GROUPS.Energy },
    { title: 'General', labels: generalLabels },
  ];

  const out: { groupTitle: string; label: string; unit: string }[] = [];
  for (const { title, labels } of groupConfigs) {
    for (const label of labels) {
      out.push({
        groupTitle: title,
        label,
        unit: KEY_PARAMETERS_LABEL_UNITS[label] ?? '',
      });
    }
  }
  return out;
}

/** Map label -> row for one device (for comparison tables). */
export function buildKeyParameterRowMap(
  deviceType: string,
  currentParameters: Record<string, number>
): Map<string, KeyParameterRow> {
  const blocks = buildKeyParameterGroupBlocks(deviceType, currentParameters);
  const map = new Map<string, KeyParameterRow>();
  for (const b of blocks) {
    for (const r of b.rows) {
      map.set(r.label, r);
    }
  }
  return map;
}
