export interface ParameterMappingRow {
  parameter: string;
  address: string;
}

export function generateParameterMappingTemplate(deviceType: string): void {
  // Create a simple CSV-style template download
  const headers = "Parameter,Address";
  const defaultMappings: Record<string, string[][]> = {
    PM5320: [
      ["V1", "3000"],
      ["V2", "3002"],
      ["V3", "3004"],
      ["I1", "3006"],
      ["I2", "3008"],
      ["I3", "3010"],
      ["P_Total", "3060"],
      ["PF_Avg", "3084"],
    ],
    PM5330: [
      ["V1", "3000"],
      ["V2", "3002"],
      ["V3", "3004"],
    ],
    PM5350: [
      ["V1", "3000"],
      ["V2", "3002"],
      ["V3", "3004"],
    ],
    Custom: [],
  };

  const rows = defaultMappings[deviceType] || [];
  const csv = [headers, ...rows.map(r => r.join(","))].join("\n");
  
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `parameter_mapping_${deviceType}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseParameterMappingFile(file: File): Promise<ParameterMappingRow[]> {
  const text = await file.text();
  const lines = text.split("\n").filter(l => l.trim());
  
  if (lines.length < 2) {
    throw new Error("File must contain a header row and at least one data row");
  }

  const mappings: ParameterMappingRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    if (cols.length >= 2 && cols[0] && cols[1]) {
      mappings.push({ parameter: cols[0], address: cols[1] });
    }
  }

  if (mappings.length === 0) {
    throw new Error("No valid parameter mappings found");
  }

  return mappings;
}

export function validateParameterMapping(mapping: ParameterMappingRow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!mapping.parameter) errors.push("Parameter name is required");
  if (!mapping.address) errors.push("Register address is required");
  return { valid: errors.length === 0, errors };
}

export function mappingsToObject(mappings: ParameterMappingRow[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const m of mappings) {
    obj[m.parameter] = m.address;
  }
  return obj;
}
