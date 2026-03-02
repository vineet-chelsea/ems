import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Download, Settings, Activity, Trash2, CheckSquare, Square, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Device } from "./EnergyDashboard";
import { ParameterChart, CHART_REFRESH_INTERVAL_MS } from "./ParameterChart";
import { ReportGenerator } from "./ReportGenerator";
import { PowerQualityDashboard } from "./PowerQualityDashboard";
import { api } from "@/services/api";
import pm5320Units from "@/data/pm5320Units.json";
import pm8000Units from "@/data/pm8000Units.json";
import { getDeviceTypeDisplayName } from "@/utils/deviceUtils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** Fixed labels for the Key Parameters table (same for all devices). */
export const KEY_PARAMETERS_LABELS = [
  'VR-Y', 'VY-B', 'VB-A', 'IR', 'IY', 'IB',
  'kW', 'KVA', 'kVAR', 'PF', 'Frequency',
  'kWh', 'KVAh', 'kVARh',
] as const;

/** Extra rows only for MICROLOGIC_6E. */
export const KEY_PARAMETERS_MICROLOGIC_6E_EXTRA = [
  'Breaker ON/OFF', 'TRIP Status', 'Spring Charged',
] as const;

/** Table groups: Voltages, Current, Power, Energy, General. */
export const KEY_PARAMETERS_GROUPS: Record<string, readonly string[]> = {
  Voltages: ['VR-Y', 'VY-B', 'VB-A'],
  Current: ['IR', 'IY', 'IB'],
  Power: ['kW', 'KVA', 'kVAR', 'PF'],
  Energy: ['kWh', 'KVAh', 'kVARh'],
  General: ['Frequency'],
};

/** Per-label display unit for formatting (optional; empty = no unit suffix). */
export const KEY_PARAMETERS_LABEL_UNITS: Record<string, string> = {
  'VR-Y': 'V', 'VY-B': 'V', 'VB-A': 'V',
  'IR': 'A', 'IY': 'A', 'IB': 'A',
  'kW': 'W', 'KVA': 'kVA', 'kVAR': 'var', 'kWh': 'kWh', 'KVAh': 'kVAh', 'kVARh': 'kVARh',
  'PF': '', 'Frequency': 'Hz',
  'Breaker ON/OFF': '', 'TRIP Status': '', 'Spring Charged': '',
};

/**
 * Device-specific mapping: label -> API parameter key.
 * Fill in the parameter key for each label per device (as returned by /data/:deviceId/latest).
 */
export type KeyParametersMapping = Partial<Record<string, string>>;

export const KEY_PARAMETERS_BY_DEVICE: Record<string, KeyParametersMapping> = {
  MICROLOGIC_6E: {
    'VR-Y': 'V12',
    'VY-B': 'V23',
    'VB-A': 'V31',
    'IR': 'I1_RMS',
    'IY': 'I2_RMS',
    'IB': 'I3_RMS',
    'kW': 'kW_Total',
    'KVA': 'kVA_Total',
    'kVAR': 'VAr_Total',
    'kWh': 'Wh',
    'KVAh': 'kVAh',
    'kVARh': 'Varh',
    'PF': 'Total PF',
    'Frequency': 'Frequency',
    'Breaker ON/OFF': 'Breaker ON',
    'TRIP Status': 'TRIP',
    'Spring Charged': 'Spring charged',
  },
  EM6400: {
    'VR-Y': 'Voltage A-B',
    'VY-B': 'Voltage B-C',
    'VB-A': 'Voltage C-A',
    'IR': 'Current A',
    'IY': 'Current B',
    'IB': 'Current C',
    'kW': 'Active Power Total',
    'KVA': 'Apparent Power Total', 'kVAR': 'Reactive Power Total', 'kWh': 'Active Energy Delivered - Received', 'KVAh': 'Apparent Energy Delivered - Received', 'kVARh': 'Reactive Energy Delivered - Received',
    'PF': 'Power Factor Total',
    'Frequency': 'Frequency',
  },
  PM5320: {
    'VR-Y': 'Voltage A-B', 'VY-B': 'Voltage B-C', 'VB-A': 'Voltage C-A',
    'IR': 'Current A', 'IY': 'Current B', 'IB': 'Current C',
    'kW': 'Active Power Total', 'KVA': 'Apparent Power Total', 'kVAR': 'Reactive Power Total', 'kWh': 'Active Energy Delivered (Into Load)', 'KVAh': 'Apparent Energy Delivered', 'kVARh': 'Reactive Energy Delivered',
    'PF': 'Power Factor Total', 'Frequency': 'Frequency',
  },
  PM8000: {
    'VR-Y': 'Voltage A-B', 'VY-B': 'Voltage B-C', 'VB-A': 'Voltage C-A',
    'IR': 'Current A', 'IY': 'Current B', 'IB': 'Current C',
    'kW': 'Active Power Total', 'KVA': 'Apparent Power Total', 'kVAR': 'Reactive Power Total', 'kWh': 'Active Energy Delivered (Into Load)', 'KVAh': 'Apparent Energy Delivered', 'kVARh': 'Reactive Energy Delivered',
    'PF': 'Power Factor Total', 'Frequency': 'Frequency',
  },
  PM5330: {
    'VR-Y': 'Voltage A-B', 'VY-B': 'Voltage B-C', 'VB-A': 'Voltage C-A',
    'IR': 'Current A', 'IY': 'Current B', 'IB': 'Current C',
    'kW': 'Active Power Total', 'KVA': 'Apparent Power Total', 'kVAR': 'Reactive Power Total', 'kWh': 'Active Energy Delivered (Into Load)', 'KVAh': 'Apparent Energy Delivered', 'kVARh': 'Reactive Energy Delivered',
    'PF': 'Power Factor Total', 'Frequency': 'Frequency',
  },
  PM5350: {
    'VR-Y': 'Voltage A-B', 'VY-B': 'Voltage B-C', 'VB-A': 'Voltage C-A',
    'IR': 'Current A', 'IY': 'Current B', 'IB': 'Current C',
    'kW': 'Active Power Total', 'KVA': 'Apparent Power Total', 'kVAR': 'Reactive Power Total', 'kWh': 'Active Energy Delivered (Into Load)', 'KVAh': 'Apparent Energy Delivered', 'kVARh': 'Reactive Energy Delivered',
    'PF': 'Power Factor Total', 'Frequency': 'Frequency',
  },
};

/** Default mapping when device type is unknown; you can provide your own keys. */
export const DEFAULT_KEY_PARAMETERS_MAPPING: KeyParametersMapping = {
  'VR-Y': 'V1', 'VY-B': 'V2', 'VB-A': 'V3',
  'IR': 'I1', 'IY': 'I2', 'IB': 'I3',
  'kW': 'Ptotal', 'KVA': '', 'kVAR': '', 'kWh': 'energy_active', 'KVAh': '', 'kVARh': '',
  'PF': 'PFavg', 'Frequency': 'frequency',
};

interface DeviceDetailViewProps {
  device: Device;
  onBack: () => void;
  onUpdateDevice: (device: Device) => void;
  onDeleteDevice: (deviceId: string) => void;
  isAdmin: boolean;
}

interface ParameterInfo {
  key: string;
  label: string;
  unit: string;
  group: string;
  description?: string;
  columnName?: string; // Database column name for data lookup
}

// Helper function to determine unit from parameter name
function getUnitFromParameter(param: string, description?: string): string {
  // 1) Exact lookup from PM5320 spreadsheet (Column A -> Column D)
  const direct = (pm5320Units as Record<string, string>)[param];
  if (direct !== undefined) return direct || '';
  const direct8000 = (pm8000Units as Record<string, string>)[param];
  if (direct8000 !== undefined) return direct8000 || '';

  const desc = (description || '').toLowerCase();
  const name = param.toLowerCase();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const n = norm(param);

  // PM8000-specific / override rules (apply even if mapping file is missing these)
  // - **Percent units**
  //   - All "worst" values are percentage
  //   - All THD and Harmonic Distortion totals are percentage
  //   - Disturbance/Distortion are percentage
  // - **Unitless**
  //   - All Power Factor / Displacement Power Factor / K-Factor / Crest Factor are unitless
  //   - Dip/Overvlt/Intrpt/Swell related are unitless
  // - **Angles**
  //   - All angles use degrees

  // Angles
  if (n.includes('angle')) return '°';

  // Unitless groups (explicit)
  if (n.includes('power factor')) return '';
  if (n.includes('k factor')) return '';
  if (n.includes('crest factor')) return '';

  // Event-ish / status-ish groups: no units
  if (
    n.includes('dip') ||
    n.includes('overvlt') ||
    n.includes('over voltage') ||
    n.includes('overvoltage') ||
    n.includes('intrpt') ||
    n.includes('interrupt') ||
    n.includes('swell')
  ) {
    return '';
  }

  // Percent groups
  if (
    n.includes('thd') ||
    n.includes('disturbance') ||
    n.includes('distortion') ||
    n.includes('unbalance') ||
    n.includes(' harmonic ') ||
    n.includes(' hd ') ||
    n.includes(' total cap hd ') ||
    n.includes(' total ind hd ') ||
    n.includes(' total even hd ') ||
    n.includes(' total odd hd ')
  ) {
    return '%';
  }
  if (n.includes('worst')) return '%';

  // Energy types
  if (name.includes('reactive energy')) return 'kVARh';
  if (name.includes('apparent energy')) return 'kVAh';
  if (name.includes('energy')) return 'kWh';

  // Power types
  if (name.includes('reactive power') || name.includes('kvar')) return 'kVAR';
  if (name.includes('apparent power') || name.includes('kva')) return 'kVA';
  if (name.includes('power') || name.includes('(kw)')) return 'kW';

  // Electrical quantities
  if (name.includes('volt')) return 'V';
  if (name.includes('current') || name.includes('(a)')) return 'A';
  if (name.includes('frequency') || name.includes('hz')) return 'Hz';
  if (name.includes('power factor') || name.startsWith('pf')) return '';
  if (name.includes('thd') || name.includes('harmonics')) return '%';

  // EM6400 computed variables - alarms are unitless (boolean flags)
  if (param === 'Over Frequency Alarm' || param === 'Under Frequency Alarm') return '';
  if (param === 'PF Total Low') return '';
  if (param === 'OverVoltage Alarm' || param === 'UnderVoltage Alarm') return '';
  if (param === 'Phase A loss' || param === 'Phase B loss' || param === 'Phase C loss') return '';
  if (param === 'Current Imbalance Alarm') return '';
  // THD High alarms are unitless flags
  if (param.includes('THD') && param.includes('High')) return '';
  // Max values have units
  if (param === 'Max Current A' || param === 'Max Current B' || param === 'Max Current C') return 'A';
  if (param === 'Max Voltage A-N' || param === 'Max Voltage B-N' || param === 'Max Voltage C-N' || param === 'Max Voltage L-N Avg') return 'V';

  // Fallbacks based on prefixes
  if (param.startsWith('V')) return 'V';
  if (param.startsWith('I')) return 'A';
  if (param.startsWith('Q')) return 'kVAR';
  if (param.startsWith('S')) return 'kVA';
  if (param.startsWith('P') && !param.includes('F')) return 'kW';
  if (param.startsWith('PF')) return '';
  if (param.includes('energy')) return 'kWh';
  if (param.includes('frequency')) return 'Hz';
  if (param.includes('THD')) return '%';
  return '';
}

// Helper function to determine group from parameter name
function getGroupFromParameter(param: string, description?: string, deviceType?: string): string {
  const desc = (description || '').toLowerCase();
  const name = param.toLowerCase();
  
  // Micrologic 6E specific grouping
  if (deviceType === 'MICROLOGIC_6E') {
    // Check for Tripping group first (most specific)
    if (name.includes('tripping') || desc.includes('tripping')) {
      return 'Tripping';
    }
    
    // Check for Harmonic group (THD)
    if (name.includes('thd') || name.includes('thd-') || desc.includes('thd')) {
      return 'Harmonic';
    }
    
    // Check for Demand group (DMD/Dmd)
    if (name.includes('dmd') || name.includes('dmnd') || name.includes('_dmd') || desc.includes('demand')) {
      return 'Demand';
    }
    
    // Current Group: Earth Leakage Current, Ground Fault Current, I_AVG, I_AVG_MAX, I_MAX, I_RMS_MAX_Present, I1_MAX, I1_RMS, I2_MAX, I2_RMS, I3_RMS, I3_MAX, N_RMS, N_MAX
    if (name === 'earth leakage current' || param === 'Earth Leakage Current') {
      return 'Current';
    }
    if (name === 'ground fault current' || param === 'Ground Fault Current') {
      return 'Current';
    }
    // Pattern matching for current parameters
    if (param === 'I1_RMS' || param === 'I2_RMS' || param === 'I3_RMS' || param === 'N_RMS' || 
        param === 'I_RMS_MAX_Present' || param === 'I1_MAX' || param === 'I2_MAX' || param === 'I3_MAX' || 
        param === 'N_MAX' || param === 'I_MAX' || param === 'I_AVG' || param === 'I_AVG_MAX') {
      return 'Current';
    }
    
    // Voltage Group: V12, V23, V31, V1-N, V2-N, V3-N, V_L-L_AVG, V_L-L_AVG_MAX, V_L-N_AVG, V_L-N_AVG_MAX, V12_Max, V23_Max, V31_Max, V1N_Max, V2N_Max, V3N_Max
    if (param === 'V12' || param === 'V23' || param === 'V31' || param === 'V12_Max' || param === 'V23_Max' || param === 'V31_Max') {
      return 'Voltage';
    }
    if (param === 'V1-N' || param === 'V2-N' || param === 'V3-N' || param === 'V1N_Max' || param === 'V2N_Max' || param === 'V3N_Max') {
      return 'Voltage';
    }
    if (param === 'V_L-L_AVG' || param === 'V_L-L_AVG_MAX' || param === 'V_L-N_AVG' || param === 'V_L-N_AVG_MAX') {
      return 'Voltage';
    }
    
    // Power & Energy Group: VAr_1, VAr_2, VAr_3, VAr_Total, Varh_Delivered, Varh_Received, Varh, Wh, Wh_Delivered, Wh_Received, kW_1, kW_2, kW_3, kW_Total, kVA_1, kVA_2, kVA_3, kVA_Total, kVAh
    if (param === 'VAr_1' || param === 'VAr_2' || param === 'VAr_3' || param === 'VAr_Total') {
      return 'Power & Energy';
    }
    if (param === 'Varh' || param === 'Varh_Delivered' || param === 'Varh_Received') {
      return 'Power & Energy';
    }
    if (param === 'Wh' || param === 'Wh_Delivered' || param === 'Wh_Received') {
      return 'Power & Energy';
    }
    if (param === 'kW_1' || param === 'kW_2' || param === 'kW_3' || param === 'kW_Total') {
      return 'Power & Energy';
    }
    if (param === 'kVA_1' || param === 'kVA_2' || param === 'kVA_3' || param === 'kVA_Total' || param === 'kVAh') {
      return 'Power & Energy';
    }
    
    // Default to General for Micrologic 6E
    return 'General';
  }
  
  // EM6400 specific grouping for computed variables
  if (deviceType === 'EM6400') {
    // Alarms group
    if (param === 'Over Frequency Alarm' || param === 'Under Frequency Alarm' ||
        param === 'PF Total Low' || param === 'OverVoltage Alarm' || param === 'UnderVoltage Alarm' ||
        param === 'Phase A loss' || param === 'Phase B loss' || param === 'Phase C loss' ||
        param === 'Current Imbalance Alarm') {
      return 'Alarms';
    }
    // THD High alarms
    if (param.includes('THD') && param.includes('High')) {
      return 'Harmonic';
    }
    // Max values
    if (param.startsWith('Max Current')) return 'Current';
    if (param.startsWith('Max Voltage')) return 'Voltage';
  }
  
  // Default grouping for other device types
  if (name.includes('volt') || desc.includes('volt')) return 'Voltage';
  if (name.includes('current') || desc.includes('current')) return 'Current';
  if (name.includes('power') || desc.includes('power') || name.includes('energy') || desc.includes('energy')) return 'Power';
  return 'General';
}

// Helper function to format parameter label
function formatParameterLabel(param: string, description?: string): string {
  if (description) {
    // Use description but clean it up
    return description.replace(/\([^)]*\)/g, '').trim();
  }
  
  // EM6400 computed variables
  if (param === 'Over Frequency Alarm') return 'Over Frequency Alarm';
  if (param === 'Under Frequency Alarm') return 'Under Frequency Alarm';
  if (param === 'PF Total Low') return 'PF Total Low';
  if (param === 'OverVoltage Alarm') return 'Over Voltage Alarm';
  if (param === 'UnderVoltage Alarm') return 'Under Voltage Alarm';
  if (param === 'Phase A loss') return 'Phase A Loss';
  if (param === 'Phase B loss') return 'Phase B Loss';
  if (param === 'Phase C loss') return 'Phase C Loss';
  if (param === 'Current Imbalance Alarm') return 'Current Imbalance Alarm';
  if (param === 'Max Current A') return 'Max Current A';
  if (param === 'Max Current B') return 'Max Current B';
  if (param === 'Max Current C') return 'Max Current C';
  if (param === 'Max Voltage A-N') return 'Max Voltage A-N';
  if (param === 'Max Voltage B-N') return 'Max Voltage B-N';
  if (param === 'Max Voltage C-N') return 'Max Voltage C-N';
  if (param === 'Max Voltage L-N Avg') return 'Max Voltage L-N Avg';
  if (param.startsWith('THD Voltage ') && param.endsWith(' High')) {
    return param.replace(' High', ' High');
  }
  if (param.startsWith('THD Current ') && param.endsWith(' High')) {
    return param.replace(' High', ' High');
  }
  
  // Format based on parameter name
  if (param === 'Ptotal') return 'Total Power';
  if (param === 'PFavg') return 'Average Power Factor';
  if (param === 'Vavg') return 'Average Voltage';
  if (param === 'Iavg') return 'Average Current';
  if (param === 'Vpeak') return 'Peak Voltage';
  if (param === 'Ipeak') return 'Peak Current';
  if (param === 'energy_active') return 'Active Energy';
  if (param === 'energy_reactive') return 'Reactive Energy';
  if (param === 'energy_apparent') return 'Apparent Energy';
  
  // Format standard parameters
  const match = param.match(/^([A-Z]+)(\d+)$/);
  if (match) {
    const [, prefix, num] = match;
    const prefixMap: Record<string, string> = {
      'V': 'Voltage L',
      'I': 'Current L',
      'P': 'Power L',
      'Q': 'Reactive Power L',
      'S': 'Apparent Power L',
      'PF': 'Power Factor L',
      'THD_V': 'THD Voltage L',
      'THD_I': 'THD Current L',
    };
    return `${prefixMap[prefix] || prefix}${num}`;
  }
  
  return param.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function DeviceDetailView({ device, onBack, onUpdateDevice, onDeleteDevice, isAdmin }: DeviceDetailViewProps) {
  const [selectedParameters, setSelectedParameters] = useState<string[]>([]);
  const [deviceName, setDeviceName] = useState(device.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [availableParameters, setAvailableParameters] = useState<ParameterInfo[]>([]);
  const [currentParameters, setCurrentParameters] = useState<Record<string, number>>(device.parameters || {});
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<'24-hours' | '7-days' | '30-days' | '12-months'>('24-hours');
  const [testingConnection, setTestingConnection] = useState(false);
  const [liveStatus, setLiveStatus] = useState<Device['status']>(device.status);
  const [liveLastSeen, setLiveLastSeen] = useState<string | undefined>(device.lastSeen);
  const [deviceMetadata, setDeviceMetadata] = useState<{
    meterName?: string;
    meterModel?: string;
    manufacturer?: string;
  }>({});
  
  // Local state for editable device settings (only for Micrologic 6E)
  const [editableSettings, setEditableSettings] = useState({
    subnetMask: device.subnetMask || '255.255.255.0',
    breakerRating: device.breakerRating ?? undefined,
    unitCost: device.unitCost ?? undefined,
    protectionIr: device.protectionIr ?? undefined,
    protectionTr: device.protectionTr ?? undefined,
    protectionIsd: device.protectionIsd ?? undefined,
    protectionTsd: device.protectionTsd ?? undefined,
    protectionIi: device.protectionIi ?? undefined,
    protectionIg: device.protectionIg ?? undefined,
    protectionTg: device.protectionTg ?? undefined,
  });
  const [isSaving, setIsSaving] = useState(false);
  
  // Update local state when device changes
  useEffect(() => {
    setEditableSettings({
      subnetMask: device.subnetMask || '255.255.255.0',
      breakerRating: device.breakerRating ?? undefined,
      unitCost: device.unitCost ?? undefined,
      protectionIr: device.protectionIr ?? undefined,
      protectionTr: device.protectionTr ?? undefined,
      protectionIsd: device.protectionIsd ?? undefined,
      protectionTsd: device.protectionTsd ?? undefined,
      protectionIi: device.protectionIi ?? undefined,
      protectionIg: device.protectionIg ?? undefined,
      protectionTg: device.protectionTg ?? undefined,
    });
  }, [device]);
  
  // Save all changes function
  const handleSaveSettings = async () => {
    if (!isAdmin) return;
    
    // Client-side validation
    const validationErrors: string[] = [];
    
    // Validate subnet mask (IP address format)
    if (editableSettings.subnetMask) {
      const subnetMaskRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!subnetMaskRegex.test(editableSettings.subnetMask)) {
        validationErrors.push('Subnet mask must be a valid IP address format (e.g., 255.255.255.0)');
      } else {
        // Validate each octet is between 0-255
        const octets = editableSettings.subnetMask.split('.');
        for (const octet of octets) {
          const num = parseInt(octet, 10);
          if (isNaN(num) || num < 0 || num > 255) {
            validationErrors.push('Subnet mask octets must be between 0 and 255');
            break;
          }
        }
      }
    }
    
    if (device.type === 'MICROLOGIC_6E') {
      // Validate protection settings
      if (editableSettings.protectionIr !== undefined && editableSettings.protectionIr !== null && editableSettings.protectionIr !== '') {
        const val = Number(editableSettings.protectionIr);
        if (isNaN(val) || val < 0.1 || val > 1.0) {
          validationErrors.push('Ir must be between 0.1 and 1.0');
        }
      }
      if (editableSettings.protectionTr !== undefined && editableSettings.protectionTr !== null && editableSettings.protectionTr !== '') {
        const val = Number(editableSettings.protectionTr);
        if (isNaN(val) || val < 0.5 || val > 25.0) {
          validationErrors.push('tr must be between 0.5 and 25.0 seconds');
        }
      }
      if (editableSettings.protectionIsd !== undefined && editableSettings.protectionIsd !== null && editableSettings.protectionIsd !== '') {
        const val = Number(editableSettings.protectionIsd);
        if (isNaN(val) || val < 1.0 || val > 10.0) {
          validationErrors.push('Isd must be between 1.0 and 10.0');
        }
      }
      if (editableSettings.protectionTsd !== undefined && editableSettings.protectionTsd !== null && editableSettings.protectionTsd !== '') {
        const val = Number(editableSettings.protectionTsd);
        if (isNaN(val) || val < 0.1 || val > 0.4) {
          validationErrors.push('tsd must be between 0.1 and 0.4 seconds');
        }
      }
      if (editableSettings.protectionIi !== undefined && editableSettings.protectionIi !== null && editableSettings.protectionIi !== '') {
        const val = Number(editableSettings.protectionIi);
        if (isNaN(val) || val < 2.0 || val > 10.0) {
          validationErrors.push('Ii must be between 2.0 and 10.0');
        }
      }
      if (editableSettings.protectionTg !== undefined && editableSettings.protectionTg !== null && editableSettings.protectionTg !== '') {
        const val = Number(editableSettings.protectionTg);
        if (isNaN(val) || val < 0.1 || val > 0.4) {
          validationErrors.push('tg must be between 0.1 and 0.4 seconds');
        }
      }
    }
    
    if (validationErrors.length > 0) {
      toast.error(`Validation errors:\n${validationErrors.join('\n')}`);
      return;
    }
    
    setIsSaving(true);
    try {
      // Prepare update payload - only include fields that are defined
      const updatePayload: any = {};
      
      if (editableSettings.subnetMask !== undefined) {
        updatePayload.subnetMask = editableSettings.subnetMask || '255.255.255.0';
      }
      
      if (editableSettings.breakerRating !== undefined) {
        updatePayload.breakerRating = editableSettings.breakerRating === null || editableSettings.breakerRating === '' ? undefined : Number(editableSettings.breakerRating);
      }
      if (editableSettings.unitCost !== undefined) {
        updatePayload.unitCost = editableSettings.unitCost === null || editableSettings.unitCost === '' ? undefined : Number(editableSettings.unitCost);
      }
      if (device.type === 'MICROLOGIC_6E') {
        if (editableSettings.protectionIr !== undefined) {
          updatePayload.protectionIr = editableSettings.protectionIr === null || editableSettings.protectionIr === '' ? undefined : Number(editableSettings.protectionIr);
        }
        if (editableSettings.protectionTr !== undefined) {
          updatePayload.protectionTr = editableSettings.protectionTr === null || editableSettings.protectionTr === '' ? undefined : Number(editableSettings.protectionTr);
        }
        if (editableSettings.protectionIsd !== undefined) {
          updatePayload.protectionIsd = editableSettings.protectionIsd === null || editableSettings.protectionIsd === '' ? undefined : Number(editableSettings.protectionIsd);
        }
        if (editableSettings.protectionTsd !== undefined) {
          updatePayload.protectionTsd = editableSettings.protectionTsd === null || editableSettings.protectionTsd === '' ? undefined : Number(editableSettings.protectionTsd);
        }
        if (editableSettings.protectionIi !== undefined) {
          updatePayload.protectionIi = editableSettings.protectionIi === null || editableSettings.protectionIi === '' ? undefined : Number(editableSettings.protectionIi);
        }
        if (editableSettings.protectionIg !== undefined) {
          updatePayload.protectionIg = editableSettings.protectionIg === 'none' || editableSettings.protectionIg === null || editableSettings.protectionIg === '' ? undefined : editableSettings.protectionIg;
        }
        if (editableSettings.protectionTg !== undefined) {
          updatePayload.protectionTg = editableSettings.protectionTg === null || editableSettings.protectionTg === '' ? undefined : Number(editableSettings.protectionTg);
        }
      }
      
      // Filter out undefined values
      Object.keys(updatePayload).forEach(key => {
        if (updatePayload[key] === undefined) {
          delete updatePayload[key];
        }
      });
      
      // Check if there are any changes to save
      if (Object.keys(updatePayload).length === 0) {
        toast.info('No changes to save');
        setIsSaving(false);
        return;
      }
      
      console.log('[DeviceDetailView] Saving settings:', updatePayload);
      const updatedDevice = await api.updateDevice(device.id, updatePayload);
      // Update local state with the response from the server
      onUpdateDevice(updatedDevice);
      // Also update editableSettings to reflect the saved values
      setEditableSettings({
        subnetMask: updatedDevice.subnetMask || '255.255.255.0',
        breakerRating: updatedDevice.breakerRating ?? undefined,
        unitCost: updatedDevice.unitCost ?? undefined,
        protectionIr: updatedDevice.protectionIr ?? undefined,
        protectionTr: updatedDevice.protectionTr ?? undefined,
        protectionIsd: updatedDevice.protectionIsd ?? undefined,
        protectionTsd: updatedDevice.protectionTsd ?? undefined,
        protectionIi: updatedDevice.protectionIi ?? undefined,
        protectionIg: updatedDevice.protectionIg ?? undefined,
        protectionTg: updatedDevice.protectionTg ?? undefined,
      });
      toast.success('Device settings updated successfully');
    } catch (err: any) {
      console.error('Error saving device settings:', err);
      const errorMsg = err?.response?.data?.error || err?.message || 'Failed to update device settings';
      const details = err?.response?.data?.details;
      
      // Format validation errors more nicely
      if (details && Array.isArray(details)) {
        const errorMessages = details.map((d: any) => {
          if (d.path && d.message) {
            const fieldName = d.path[0] || 'field';
            return `${fieldName}: ${d.message}`;
          }
          return d.message || JSON.stringify(d);
        });
        toast.error(`Validation errors:\n${errorMessages.join('\n')}`);
      } else {
        toast.error(details ? `${errorMsg}: ${JSON.stringify(details)}` : errorMsg);
      }
    } finally {
      setIsSaving(false);
    }
  };
  
  // Update local state when device changes
  useEffect(() => {
    setEditableSettings({
      breakerRating: device.breakerRating ?? undefined,
      unitCost: device.unitCost ?? undefined,
      protectionIr: device.protectionIr ?? undefined,
      protectionTr: device.protectionTr ?? undefined,
      protectionIsd: device.protectionIsd ?? undefined,
      protectionTsd: device.protectionTsd ?? undefined,
      protectionIi: device.protectionIi ?? undefined,
      protectionIg: device.protectionIg ?? undefined,
      protectionTg: device.protectionTg ?? undefined,
    });
  }, [device]);

  // Load available parameters from database (only parameters that have data)
  useEffect(() => {
    const loadDeviceParameters = async () => {
      try {
        setLoadingConfig(true);
        
        // Check if device is Custom type - show message instead of parameters
        if (device.type === 'Custom') {
          setAvailableParameters([]);
          setLoadingConfig(false);
          return;
        }

        // Always try to get from config first (for new devices without data yet)
        let params: ParameterInfo[] = [];
        try {
          const config = await api.getDeviceConfig(device.type);
          if (config.registerMappings && Array.isArray(config.registerMappings)) {
            const seenParameters = new Set<string>();
            params = config.registerMappings
              .filter((mapping: any) => {
                const dataType = (mapping.dataType || '').toUpperCase();
                return dataType !== 'UTF8' && dataType !== 'DATETIME';
              })
              .map((mapping: any) => ({
                key: mapping.parameter,
                label: mapping.parameter, // Use exact parameter name from JSON
                unit: mapping.unit || '', // Use unit from JSON only (no fallback)
                group: getGroupFromParameter(mapping.parameter, mapping.description, device.type),
                description: mapping.description,
              }))
              .filter((param: ParameterInfo) => {
                if (seenParameters.has(param.key)) {
                  return false;
                }
                seenParameters.add(param.key);
                return true;
              });
            
            params.sort((a, b) => {
              if (a.group !== b.group) {
                return a.group.localeCompare(b.group);
              }
              return a.key.localeCompare(b.key);
            });
          }
        } catch (configError) {
          console.warn('Could not load device config:', configError);
        }

        // Always show ONLY config-defined parameters in the UI.
        // If DB returns columnName mappings, attach them so time-series queries work reliably.
        let finalParams: ParameterInfo[] = params;
        const normalize = (s: string) =>
          s
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        
        try {
          const dbParameters = await api.getDeviceParameters(device.id);
          if (Array.isArray(dbParameters) && dbParameters.length > 0) {
            const colByKey = new Map<string, string>();
            const dbColumnNames = new Set<string>();
            
            for (const dbParam of dbParameters) {
              if (dbParam?.key && dbParam?.columnName) {
                colByKey.set(normalize(String(dbParam.key)), String(dbParam.columnName));
                dbColumnNames.add(String(dbParam.columnName).toLowerCase());
              }
            }

            finalParams = params.map((p) => ({
              ...p,
              columnName: colByKey.get(normalize(p.key)) || p.columnName,
            }));
            
            // For EM6400, also check for computed variables in database that aren't in config
            if (device.type === 'EM6400') {
              // Map of database column names to display parameter info
              const computedVarMap: Record<string, { key: string; label: string; unit: string; group: string }> = {
                'over_frequency_alarm': { key: 'Over Frequency Alarm', label: 'Over Frequency Alarm', unit: '', group: 'Alarms' },
                'under_frequency_alarm': { key: 'Under Frequency Alarm', label: 'Under Frequency Alarm', unit: '', group: 'Alarms' },
                'pf_total_low': { key: 'PF Total Low', label: 'PF Total Low', unit: '', group: 'Alarms' },
                'overvoltage_alarm': { key: 'OverVoltage Alarm', label: 'Over Voltage Alarm', unit: '', group: 'Alarms' },
                'undervoltage_alarm': { key: 'UnderVoltage Alarm', label: 'Under Voltage Alarm', unit: '', group: 'Alarms' },
                'phase_a_loss': { key: 'Phase A loss', label: 'Phase A Loss', unit: '', group: 'Alarms' },
                'phase_b_loss': { key: 'Phase B loss', label: 'Phase B Loss', unit: '', group: 'Alarms' },
                'phase_c_loss': { key: 'Phase C loss', label: 'Phase C Loss', unit: '', group: 'Alarms' },
                'current_imbalance_alarm': { key: 'Current Imbalance Alarm', label: 'Current Imbalance Alarm', unit: '', group: 'Alarms' },
                'thd_voltage_a_b_high': { key: 'THD Voltage A-B High', label: 'THD Voltage A-B High', unit: '', group: 'Harmonic' },
                'thd_voltage_b_c_high': { key: 'THD Voltage B-C High', label: 'THD Voltage B-C High', unit: '', group: 'Harmonic' },
                'thd_voltage_c_a_high': { key: 'THD Voltage C-A High', label: 'THD Voltage C-A High', unit: '', group: 'Harmonic' },
                'thd_voltage_l_l_high': { key: 'THD Voltage L-L High', label: 'THD Voltage L-L High', unit: '', group: 'Harmonic' },
                'thd_voltage_a_n_high': { key: 'THD Voltage A-N High', label: 'THD Voltage A-N High', unit: '', group: 'Harmonic' },
                'thd_voltage_b_n_high': { key: 'THD Voltage B-N High', label: 'THD Voltage B-N High', unit: '', group: 'Harmonic' },
                'thd_voltage_c_n_high': { key: 'THD Voltage C-N High', label: 'THD Voltage C-N High', unit: '', group: 'Harmonic' },
                'thd_voltage_l_n_high': { key: 'THD Voltage L-N High', label: 'THD Voltage L-N High', unit: '', group: 'Harmonic' },
                'thd_current_a_high': { key: 'THD Current A High', label: 'THD Current A High', unit: '', group: 'Harmonic' },
                'thd_current_b_high': { key: 'THD Current B High', label: 'THD Current B High', unit: '', group: 'Harmonic' },
                'thd_current_c_high': { key: 'THD Current C High', label: 'THD Current C High', unit: '', group: 'Harmonic' },
                'thd_current_n_high': { key: 'THD Current N High', label: 'THD Current N High', unit: '', group: 'Harmonic' },
                'thd_current_g_high': { key: 'THD Current G High', label: 'THD Current G High', unit: '', group: 'Harmonic' },
                'max_current_a': { key: 'Max Current A', label: 'Max Current A', unit: 'A', group: 'Current' },
                'max_current_b': { key: 'Max Current B', label: 'Max Current B', unit: 'A', group: 'Current' },
                'max_current_c': { key: 'Max Current C', label: 'Max Current C', unit: 'A', group: 'Current' },
                'max_voltage_a_n': { key: 'Max Voltage A-N', label: 'Max Voltage A-N', unit: 'V', group: 'Voltage' },
                'max_voltage_b_n': { key: 'Max Voltage B-N', label: 'Max Voltage B-N', unit: 'V', group: 'Voltage' },
                'max_voltage_c_n': { key: 'Max Voltage C-N', label: 'Max Voltage C-N', unit: 'V', group: 'Voltage' },
                'max_voltage_l_n_avg': { key: 'Max Voltage L-N Avg', label: 'Max Voltage L-N Avg', unit: 'V', group: 'Voltage' },
              };
              
              // Find computed variables in database that aren't in config
              const existingKeys = new Set(finalParams.map(p => normalize(p.key)));
              const existingColumnNames = new Set(finalParams.map(p => p.columnName?.toLowerCase()).filter(Boolean));
              const computedVarsFromDb: ParameterInfo[] = [];
              
              // Create a reverse map: normalized key -> computedVar info (for matching by key from backend)
              const computedVarByKey: Record<string, { key: string; label: string; unit: string; group: string }> = {};
              Object.values(computedVarMap).forEach(cv => {
                computedVarByKey[normalize(cv.key)] = cv;
              });
              
              for (const dbParam of dbParameters) {
                if (!dbParam?.key && !dbParam?.columnName) continue;
                
                const dbKey = String(dbParam.key || '');
                const colName = String(dbParam.columnName || '').toLowerCase();
                const normalizedKey = normalize(dbKey);
                
                // Skip if we already have this key or column name
                if (existingKeys.has(normalizedKey)) continue;
                if (colName && existingColumnNames.has(colName)) continue;
                
                // Try to match by key first (backend returns proper parameter names)
                let computedVar = computedVarByKey[normalizedKey];
                
                // If not found by key, try by column name
                if (!computedVar && colName) {
                  computedVar = computedVarMap[colName];
                }
                
                if (computedVar) {
                  computedVarsFromDb.push({
                    key: computedVar.key,
                    label: computedVar.label,
                    unit: computedVar.unit,
                    group: computedVar.group,
                    columnName: dbParam.columnName || colName,
                  });
                } else {
                  // Fallback: if it's a computed variable but not in our map, try to format it
                  // Check if it looks like a computed variable (contains common patterns)
                  const keyLower = dbKey.toLowerCase();
                  const looksLikeComputed = 
                    colName.includes('_alarm') || 
                    colName.includes('_high') || 
                    colName.includes('_loss') || 
                    colName.startsWith('max_') ||
                    colName.startsWith('thd_') ||
                    keyLower.includes('alarm') ||
                    keyLower.includes('high') ||
                    keyLower.includes('loss') ||
                    keyLower.startsWith('max') ||
                    keyLower.includes('thd');
                  
                  if (looksLikeComputed) {
                    // Use the key from backend if available, otherwise format the column name
                    // If key is empty or just the column name, try to reconstruct from column name
                    let keyToUse = dbKey;
                    if (!keyToUse || keyToUse === colName) {
                      // Reconstruct parameter name from column name
                      // e.g., "thd_voltage_a_b_high" -> "THD Voltage A-B High"
                      keyToUse = colName
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase())
                        .replace(/\sA\sB\s/g, ' A-B ')
                        .replace(/\sB\sC\s/g, ' B-C ')
                        .replace(/\sC\sA\s/g, ' C-A ')
                        .replace(/\sL\sL\s/g, ' L-L ')
                        .replace(/\sL\sN\s/g, ' L-N ')
                        .replace(/\sA\sN\s/g, ' A-N ')
                        .replace(/\sB\sN\s/g, ' B-N ')
                        .replace(/\sC\sN\s/g, ' C-N ')
                        .replace(/\sHigh\s*$/, ' High')
                        .replace(/\sAlarm\s*$/, ' Alarm')
                        .replace(/\sLoss\s*$/, ' Loss');
                    }
                    
                    // For computed variables not in map, use key as label (no formatting)
                    // Units should come from JSON only, so use empty string
                    const formattedGroup = getGroupFromParameter(keyToUse, undefined, device.type);
                    
                    computedVarsFromDb.push({
                      key: keyToUse,
                      label: keyToUse, // Use exact key as label (no formatting)
                      unit: '', // Use unit from JSON only (no fallback)
                      group: formattedGroup,
                      columnName: dbParam.columnName || colName,
                    });
                  }
                }
              }
              
              finalParams = [...finalParams, ...computedVarsFromDb];
            }
          }
        } catch (dbError) {
          // DB error - still show config parameters
          console.warn('Could not load parameters from database:', dbError);
        }
        
        // Ensure all parameters have labels (use key as label if missing, no formatting)
        // Units should come from JSON only, so use empty string if missing
        finalParams = finalParams.map(p => ({
          ...p,
          label: p.label || p.key, // Use exact key if label missing (no formatting)
          unit: p.unit || '', // Use unit from JSON only (no fallback)
          group: p.group || getGroupFromParameter(p.key, undefined, device.type),
        }));
        
        // Re-sort after adding computed variables
        finalParams.sort((a, b) => {
          if (a.group !== b.group) {
            return a.group.localeCompare(b.group);
          }
          return a.key.localeCompare(b.key);
        });

        setAvailableParameters(finalParams);
      } catch (error) {
        console.error('Error loading device parameters:', error);
        toast.error('Failed to load device parameters');
        setAvailableParameters([]);
      } finally {
        setLoadingConfig(false);
      }
    };
    
    loadDeviceParameters();
  }, [device.id]); // Only reload when device.id changes (when device is added/changed)

  // Real-time data polling (keep charts smooth without remounting)
  useEffect(() => {
    let isMounted = true;
    const fetchLatestData = async () => {
      try {
        const latestData = await api.getLatestData(device.id);
        if (!isMounted) return;
        if (!latestData) {
          // No latest row yet or request failed upstream
          setLiveStatus('offline');
          return;
        }

        const params: Record<string, number> = {};
        const metadata: { meterName?: string; meterModel?: string; manufacturer?: string } = {};
        
        Object.keys(latestData).forEach(key => {
          if (key !== 'id' && key !== 'timestamp') {
            const value = latestData[key as keyof typeof latestData];
            
            // Extract UTF8 metadata (string values)
            // Database columns are sanitized: "Meter Name" -> "meter_name", "Meter Model" -> "meter_model", "Manufacturer" -> "manufacturer"
            // Backend may return both sanitized names and original parameter names
            if (typeof value === 'string' && value.trim().length > 0) {
              const keyLower = key.toLowerCase();
              const keySanitized = keyLower.replace(/[^a-z0-9]/g, '_');
              
              // Match by original parameter name or sanitized column name
              if (key === 'Meter Name' || keySanitized === 'meter_name' || 
                  (keyLower.includes('meter') && keyLower.includes('name'))) {
                metadata.meterName = value;
              } else if (key === 'Meter Model' || keySanitized === 'meter_model' || 
                         (keyLower.includes('meter') && keyLower.includes('model'))) {
                metadata.meterModel = value;
              } else if (key === 'Manufacturer' || keySanitized === 'manufacturer' || 
                         keyLower === 'manufacturer') {
                metadata.manufacturer = value;
              }
            }
            
            // Extract numeric parameters (number or string that parses to number - DB/driver may return strings)
            let numValue: number | null = null;
            if (typeof value === 'number' && isFinite(value)) {
              numValue = value;
            } else if (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value))) {
              const parsed = Number(value);
              if (Number.isFinite(parsed)) numValue = parsed;
            }
            if (numValue !== null) {
              params[key] = numValue;
              const lowerKey = key.toLowerCase();
              if (lowerKey !== key) params[lowerKey] = numValue;
              const sanitizedKey = lowerKey.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
              if (sanitizedKey !== key && sanitizedKey !== lowerKey) params[sanitizedKey] = numValue;
              availableParameters.forEach(param => {
                const paramKeyLower = param.key.toLowerCase();
                const paramSanitized = paramKeyLower.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
                if (sanitizedKey === paramSanitized || lowerKey === paramSanitized) {
                  params[param.key] = numValue;
                  params[paramKeyLower] = numValue;
                }
                const paramWithColumn = param as ParameterInfo & { columnName?: string };
                if (paramWithColumn.columnName && (key === paramWithColumn.columnName || lowerKey === paramWithColumn.columnName.toLowerCase())) {
                  params[param.key] = numValue;
                  params[paramKeyLower] = numValue;
                }
              });
            }
          }
        });
        
        setDeviceMetadata(metadata);

        setCurrentParameters(params);
        const ts = latestData.timestamp ? new Date(latestData.timestamp).getTime() : NaN;
        if (!isNaN(ts)) {
          setLiveLastSeen(new Date(ts).toISOString());
          // Mark offline if stale (align with chart stale logic: 1 minute)
          const isStale = Date.now() - ts > 60 * 1000;
          setLiveStatus(isStale ? 'offline' : 'online');
        } else {
          // If backend didn't return a timestamp, fall back to device status
          setLiveStatus(device.status || 'offline');
        }
      } catch (error: any) {
        setLiveStatus('offline');
      }
    };

    fetchLatestData();
    const interval = setInterval(fetchLatestData, CHART_REFRESH_INTERVAL_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [device.id, availableParameters]);

  const handleNameUpdate = () => {
    const updatedDevice = { ...device, name: deviceName };
    onUpdateDevice(updatedDevice);
    setIsEditingName(false);
  };

  // Group parameters by category
  const groupedParameters = availableParameters.reduce((acc, param) => {
    if (!acc[param.group]) {
      acc[param.group] = [];
    }
    acc[param.group].push(param);
    return acc;
  }, {} as Record<string, ParameterInfo[]>);

  const handleSelectAll = (group: string) => {
    const groupParams = groupedParameters[group] || [];
    const groupKeys = groupParams.map(p => p.key);
    const allSelected = groupKeys.every(key => selectedParameters.includes(key));
    
    if (allSelected) {
      setSelectedParameters(prev => prev.filter(key => !groupKeys.includes(key)));
    } else {
      setSelectedParameters(prev => [...new Set([...prev, ...groupKeys])]);
    }
  };

  const getStatusIcon = () => {
    switch (liveStatus || device.status) {
      case 'online':
        return <Activity className="w-4 h-4 text-success" />;
      case 'offline':
        return <Activity className="w-4 h-4 text-destructive" />;
      case 'connecting':
        return <Activity className="w-4 h-4 text-warning animate-pulse" />;
    }
  };

  const getStatusColor = () => {
    switch (liveStatus || device.status) {
      case 'online':
        return 'bg-success text-success-foreground';
      case 'offline':
        return 'bg-destructive text-destructive-foreground';
      case 'connecting':
        return 'bg-warning text-warning-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="hover:bg-muted">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="text-2xl font-bold border-2 border-primary"
                  onKeyDown={(e) => e.key === 'Enter' && handleNameUpdate()}
                />
                <Button onClick={handleNameUpdate} size="sm">Save</Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setDeviceName(device.name);
                    setIsEditingName(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 
                  className="text-3xl font-bold cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setIsEditingName(true)}
                >
                  {device.name}
                </h1>
                  <Badge className={getStatusColor()}>
                    {getStatusIcon()}
                    <span className="ml-2">{liveStatus || device.status}</span>
                  </Badge>
              </div>
            )}
            <p className="text-muted-foreground mt-1">
              {getDeviceTypeDisplayName(device.type)} • {device.ipAddress} • Last seen:{' '}
              {(() => {
                const raw = liveLastSeen || device.lastSeen;
                if (!raw) return 'N/A';
                const d = new Date(raw);
                return isNaN(d.getTime()) ? String(raw) : d.toLocaleString();
              })()}
            </p>
          </div>
        </div>

        {/* Device Metadata (UTF8 parameters) */}
        {(deviceMetadata.meterName || deviceMetadata.meterModel || deviceMetadata.manufacturer) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="w-5 h-5" />
                Device Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {deviceMetadata.manufacturer && (
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Manufacturer</span>
                    <div className="font-medium">{deviceMetadata.manufacturer}</div>
                  </div>
                )}
                {deviceMetadata.meterModel && (
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Meter Model</span>
                    <div className="font-medium">{deviceMetadata.meterModel}</div>
                  </div>
                )}
                {deviceMetadata.meterName && (
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Meter Name</span>
                    <div className="font-medium">{deviceMetadata.meterName}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <Tabs defaultValue="monitoring" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="monitoring">Real-time Monitoring</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="monitoring" className="space-y-6">
            {/* Key parameters: 5 tables (Voltages, Current, Power, Energy, General) full width */}
            <div className="w-full">
            {(() => {
              const toNum = (v: unknown): number | undefined => {
                if (typeof v === 'number' && isFinite(v)) return v;
                if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) {
                  const n = Number(v);
                  return Number.isFinite(n) ? n : undefined;
                }
                return undefined;
              };
              const getVal = (key: string): number | undefined => {
                let v: unknown = currentParameters[key] ?? currentParameters[key.toLowerCase()];
                let out = toNum(v);
                if (out !== undefined) return out;
                const sanitized = key.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
                out = toNum(currentParameters[sanitized]);
                if (out !== undefined) return out;
                // Fallback: match any stored key whose sanitized form equals this key's sanitized form
                const matchKey = Object.keys(currentParameters).find(
                  (k) => k.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_') === sanitized
                );
                return matchKey !== undefined ? toNum(currentParameters[matchKey]) : undefined;
              };
              const formatVal = (val: number | undefined, unit: string, label?: string, alreadyScaled = false) => {
                if (val === undefined) return '—';
                if (label === 'Breaker ON/OFF' || label === 'TRIP Status' || label === 'Spring Charged') {
                  return val === 1 ? 'ON' : val === 0 ? 'OFF' : String(val);
                }
                if (unit === '%' || unit === '') return val.toFixed(2);
                if (unit === 'V' || unit === 'A') return `${val.toFixed(1)} ${unit}`;
                if (unit === 'Hz') return `${val.toFixed(2)} Hz`;
                if (unit === 'W') return alreadyScaled ? `${val.toFixed(2)} kW` : `${(val).toFixed(2)} kW`;
                if (unit === 'kVA') return alreadyScaled ? `${val.toFixed(2)} kVA` : `${(val).toFixed(2)} kVA`;
                if (unit === 'var') return alreadyScaled ? `${val.toFixed(2)} kVAR` : `${(val).toFixed(2)} kVAR`;
                if (unit === 'kWh' || unit === 'kVAh' || unit === 'kVARh') return `${val.toFixed(1)} ${unit}`;
                return `${val.toFixed(1)}`;
              };
              const keySpec = KEY_PARAMETERS_BY_DEVICE[device.type] ?? {};
              const mapping: KeyParametersMapping = { ...DEFAULT_KEY_PARAMETERS_MAPPING, ...keySpec };
              const standardLabels = [...KEY_PARAMETERS_LABELS];
              const extraLabels = device.type === 'MICROLOGIC_6E' ? [...KEY_PARAMETERS_MICROLOGIC_6E_EXTRA] : [];
              const allLabels = [...standardLabels, ...extraLabels];
              const powerEnergyLabels = ['kW', 'KVA', 'kVAR', 'kWh', 'KVAh', 'kVARh'];
              const powerEnergyLabels2 = ['kW', 'KVA', 'kVAR'];
              const rows: { label: string; value: number | undefined; unit: string; alreadyScaled?: boolean }[] = allLabels.map((label) => {
                const paramKey = mapping[label];
                let value = paramKey && paramKey.trim() ? getVal(paramKey) : undefined;
                const isMicrologic6EPowerEnergy = device.type === 'MICROLOGIC_6E' && powerEnergyLabels.includes(label);
                if (isMicrologic6EPowerEnergy && value !== undefined) {
                  value = value / 1000;
                }
                const isPM8000energy = device.type === 'PM8000' && powerEnergyLabels2.includes(label);
                if (isPM8000energy && value !== undefined) {
                  value = value / 1000;
                }
                const unit = KEY_PARAMETERS_LABEL_UNITS[label] ?? '';
                return { label, value, unit, alreadyScaled: isMicrologic6EPowerEnergy };
              });
              const paramCount = Object.keys(currentParameters).length;
              const generalLabels = [...KEY_PARAMETERS_GROUPS.General];
              if (device.type === 'MICROLOGIC_6E') generalLabels.push(...KEY_PARAMETERS_MICROLOGIC_6E_EXTRA);
              const groupConfigs: { title: string; labels: string[] }[] = [
                { title: 'Voltages', labels: [...KEY_PARAMETERS_GROUPS.Voltages] },
                { title: 'Current', labels: [...KEY_PARAMETERS_GROUPS.Current] },
                { title: 'Power', labels: [...KEY_PARAMETERS_GROUPS.Power] },
                { title: 'Energy', labels: [...KEY_PARAMETERS_GROUPS.Energy] },
                { title: 'General', labels: generalLabels },
              ];
              return (
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {groupConfigs.map(({ title, labels }) => {
                    const groupRows = rows.filter((r) => labels.includes(r.label));
                    if (groupRows.length === 0) return null;
                    return (
                      <Card key={title} className="overflow-hidden shadow-sm w-full min-w-0">
                        <CardHeader className="pb-2 pt-3 px-4 border-b border-border/50 bg-muted/20">
                          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
                          <CardDescription className="text-xs mt-0.5">
                            {paramCount === 0 ? 'No data' : device.type}
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
                                {groupRows.map((r, i) => (
                                  <tr key={i} className="hover:bg-green-100/50 dark:hover:bg-green-900/20 transition-colors even:bg-green-50/80 dark:even:bg-green-950/40 odd:bg-card">
                                    <td className="py-2 px-4 text-xs font-medium text-foreground/90">{r.label}</td>
                                    <td className="py-2 px-4 text-right text-sm font-bold font-mono text-foreground tabular-nums tracking-tight">{formatVal(r.value, r.unit, r.label, r.alreadyScaled)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              );
            })()}
            </div>

            {/* Charts */}
            <div className={`w-full ${selectedParameters.length > 0 ? 'grid grid-cols-1 xl:grid-cols-2 gap-6' : ''}`}>
                {selectedParameters.length > 0 && selectedParameters.map((paramKey) => {
                  const param = availableParameters.find(p => p.key === paramKey);
                  if (!param) return null;
                  const paramKeyLower = paramKey.toLowerCase();
                  const paramKeySanitized = paramKeyLower.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
                  let currentValue = currentParameters[paramKey]
                    || currentParameters[paramKeyLower]
                    || currentParameters[paramKeySanitized];
                  if (currentValue === undefined) {
                    const matchingKey = Object.keys(currentParameters).find(key => {
                      const keyLower = key.toLowerCase();
                      const keySanitized = keyLower.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
                      if (keySanitized === paramKeySanitized) return true;
                      if (keyLower.includes(paramKeyLower) || paramKeyLower.includes(keyLower)) {
                        if (paramKeyLower.length > 2 && keyLower.length > 2) return true;
                      }
                      const keyNormalized = keyLower.replace(/[^a-z0-9]/g, '');
                      const paramNormalized = paramKeyLower.replace(/[^a-z0-9]/g, '');
                      if (keyNormalized === paramNormalized && keyNormalized.length > 3) return true;
                      return false;
                    });
                    if (matchingKey) currentValue = currentParameters[matchingKey];
                  }
                  if (currentValue === undefined || currentValue === null || isNaN(currentValue)) currentValue = undefined;
                  return (
                    <ParameterChart
                      key={paramKey}
                      parameter={param}
                      value={currentValue}
                      deviceName={device.name}
                      deviceId={device.id}
                      period={chartPeriod}
                      deviceStatus={liveStatus || device.status}
                      lastSeen={liveLastSeen || device.lastSeen}
                    />
                  );
                })}
              </div>

            {/* Parameter Selection - whole card collapsible; columns fill width */}
            <Card>
              <Collapsible defaultOpen={true} className="group">
                <CollapsibleTrigger asChild>
                  <button type="button" className="w-full text-left hover:bg-muted/30 transition-colors rounded-t-lg">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle>Parameter Selection</CardTitle>
                        <CardDescription>
                          Select the parameters you want to monitor in real-time. Parameters are loaded from device configuration.
                        </CardDescription>
                      </div>
                      <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </CardHeader>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
              <CardContent>
                {loadingConfig ? (
                  <div className="flex items-center justify-center py-8">
                    <Activity className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
                    <span className="text-muted-foreground">Loading parameters...</span>
                  </div>
                ) : device.type === 'Custom' ? (
                  <div className="p-8 text-center border rounded-lg bg-muted/30">
                    <p className="text-lg font-semibold mb-2">Custom Device Provisioning</p>
                    <p className="text-muted-foreground mb-4">
                      This device requires custom configuration. Please contact the development team for device provisioning.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Email: <a href="mailto:vemconindustries@gmail.com" className="text-primary hover:underline">vemconindustries@gmail.com</a>
                    </p>
                  </div>
                ) : availableParameters.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No parameters available. Please configure device parameters.
                  </div>
                ) : (
                  <div
                    className="grid gap-4 w-full pb-2"
                    style={{ gridTemplateColumns: `repeat(${Object.keys(groupedParameters).length}, minmax(0, 1fr))` }}
                  >
                    {Object.entries(groupedParameters).map(([group, params]) => {
                      const groupKeys = params.map(p => p.key);
                      const allSelected = groupKeys.every(key => selectedParameters.includes(key));
                      return (
                        <Collapsible key={group} defaultOpen={true}>
                          <div className="flex flex-col min-w-0 rounded-lg border bg-card h-[320px] overflow-hidden">
                            <CollapsibleTrigger asChild>
                              <button className="group flex items-center justify-between p-3 border-b font-semibold text-sm hover:bg-muted/50 transition-colors text-left w-full">
                                <span>{group}</span>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="flex flex-col flex-1 min-h-0">
                              <div className="overflow-y-auto flex-1 p-2 space-y-1">
                                {params.map((param, index) => {
                                  const isSelected = selectedParameters.includes(param.key);
                                  const currentValue = currentParameters[param.key] || currentParameters[param.key.toLowerCase()];
                                  return (
                                    <div
                                      key={`${param.key}-${index}`}
                                      className={`flex items-start gap-2 p-2 rounded border transition-colors ${
                                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                                      }`}
                                    >
                                      <Checkbox
                                        id={`${param.key}-${index}`}
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          if (checked) setSelectedParameters(prev => [...prev, param.key]);
                                          else setSelectedParameters(prev => prev.filter(p => p !== param.key));
                                        }}
                                        className="mt-0.5 shrink-0"
                                      />
                                      <label htmlFor={`${param.key}-${index}`} className="flex-1 text-xs font-medium leading-tight cursor-pointer min-w-0">
                                        <span className="truncate block">{param.label}</span>
                                        {device.status === 'online' && currentValue !== undefined && isSelected && (
                                          <span className="text-muted-foreground">
                                            {typeof currentValue === 'number'
                                              ? param.unit === '%' ? `${currentValue.toFixed(1)}%` : param.key.startsWith('PF') ? currentValue.toFixed(3) : `${currentValue.toFixed(1)} ${param.unit || ''}`
                                              : 'N/A'}
                                          </span>
                                        )}
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="p-2 border-t">
                                <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => handleSelectAll(group)}>
                                  {allSelected ? <><CheckSquare className="w-3 h-3 mr-1" /> Deselect All</> : <><Square className="w-3 h-3 mr-1" /> Select All</>}
                                </Button>
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Events & Alarms - at bottom */}
            <PowerQualityDashboard
              device={device}
              selectedPeriod={chartPeriod}
              onPeriodChange={setChartPeriod}
            />

            {(liveStatus || device.status) !== 'online' && (
              <Card className="text-center py-12">
                <CardContent>
                  <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Device Offline</h3>
                  <p className="text-muted-foreground">
                    Connect your device to view real-time monitoring data
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="reports">
            <ReportGenerator device={device} availableParameters={availableParameters.length > 0 ? availableParameters : []} />
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Device Settings</CardTitle>
                <CardDescription>
                  Configure your device parameters and connection settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Device Type</Label>
                    <div className="p-2 bg-muted rounded text-sm">{getDeviceTypeDisplayName(device.type)}</div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Badge className={getStatusColor()}>
                      {getStatusIcon()}
                      <span className="ml-2">{device.status}</span>
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <Label>IP Address</Label>
                    <div className="p-2 bg-muted rounded text-sm">{device.ipAddress}</div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-subnet-mask">Subnet Mask</Label>
                    {isAdmin ? (
                      <Input
                        id="edit-subnet-mask"
                        placeholder="255.255.255.0"
                        value={editableSettings.subnetMask || ''}
                        onChange={(e) => setEditableSettings(prev => ({ ...prev, subnetMask: e.target.value }))}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded text-sm">{device.subnetMask}</div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Slave Address</Label>
                    <div className="p-2 bg-muted rounded text-sm">{device.slaveAddress ?? 1}</div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-breaker-rating">Breaker Rating (A)</Label>
                    {isAdmin ? (
                      <Input
                        id="edit-breaker-rating"
                        type="number"
                        min="0"
                        placeholder="e.g., 100"
                        value={editableSettings.breakerRating ?? ''}
                        onChange={(e) => {
                          const value = e.target.value === '' ? undefined : e.target.value;
                          setEditableSettings(prev => ({ ...prev, breakerRating: value }));
                        }}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded text-sm">{device.breakerRating ?? '—'}</div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-unit-cost">Unit Cost (Rs/kWh)</Label>
                    {isAdmin ? (
                      <Input
                        id="edit-unit-cost"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g., 9.50"
                        value={editableSettings.unitCost ?? ''}
                        onChange={(e) => {
                          const value = e.target.value === '' ? undefined : e.target.value;
                          setEditableSettings(prev => ({ ...prev, unitCost: value }));
                        }}
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded text-sm">{device.unitCost ?? '—'}</div>
                    )}
                  </div>
                  
                  {/* Micrologic 6E Protection Settings - Read-only display */}
                  {device.type === 'MICROLOGIC_6E' && (
                    <>
                      <div className="space-y-2">
                        <Label>Ir (Long Time Overload)</Label>
                        <div className="p-2 bg-muted rounded text-sm">
                          {device.protectionIr ?? '—'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>tr (Long Time Overload Duration) (s)</Label>
                        <div className="p-2 bg-muted rounded text-sm">
                          {device.protectionTr ?? '—'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Isd (Short Time)</Label>
                        <div className="p-2 bg-muted rounded text-sm">
                          {device.protectionIsd ?? '—'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>tsd (s)</Label>
                        <div className="p-2 bg-muted rounded text-sm">
                          {device.protectionTsd ?? '—'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Ii (Instantaneous)</Label>
                        <div className="p-2 bg-muted rounded text-sm">
                          {device.protectionIi ?? '—'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Ig</Label>
                        <div className="p-2 bg-muted rounded text-sm">
                          {device.protectionIg ?? '—'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>tg(s)</Label>
                        <div className="p-2 bg-muted rounded text-sm">
                          {device.protectionTg ?? '—'}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Micrologic 6E Protection Settings - Editable section */}
                {device.type === 'MICROLOGIC_6E' && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <Label className="text-base font-semibold">Protection Settings</Label>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Ir (Long Time Overload) */}
                      <div className="space-y-2">
                        <Label htmlFor="edit-protection-ir">Ir (Long Time Overload)</Label>
                        <Input
                          id="edit-protection-ir"
                          type="number"
                          min="0.1"
                          max="1.0"
                          step="0.1"
                          placeholder="0.1 - 1.0"
                          value={editableSettings.protectionIr ?? ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : e.target.value;
                            setEditableSettings(prev => ({ ...prev, protectionIr: value }));
                          }}
                        />
                      </div>

                      {/* tr (Long time overload duration) */}
                      <div className="space-y-2">
                        <Label htmlFor="edit-protection-tr">tr (Long Time Overload Duration) (s)</Label>
                        <Input
                          id="edit-protection-tr"
                          type="number"
                          min="0.5"
                          max="25.0"
                          step="0.1"
                          placeholder="0.5 - 25.0"
                          value={editableSettings.protectionTr ?? ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : e.target.value;
                            setEditableSettings(prev => ({ ...prev, protectionTr: value }));
                          }}
                        />
                      </div>

                      {/* Isd (Short Time) */}
                      <div className="space-y-2">
                        <Label htmlFor="edit-protection-isd">Isd (Short Time)</Label>
                        <Input
                          id="edit-protection-isd"
                          type="number"
                          min="1.0"
                          max="10.0"
                          step="0.5"
                          placeholder="1.0 - 10.0"
                          value={editableSettings.protectionIsd ?? ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : e.target.value;
                            setEditableSettings(prev => ({ ...prev, protectionIsd: value }));
                          }}
                        />
                      </div>

                      {/* tsd */}
                      <div className="space-y-2">
                        <Label htmlFor="edit-protection-tsd">tsd (s)</Label>
                        <Input
                          id="edit-protection-tsd"
                          type="number"
                          min="0.1"
                          max="0.4"
                          step="0.1"
                          placeholder="0.1 - 0.4"
                          value={editableSettings.protectionTsd ?? ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : e.target.value;
                            setEditableSettings(prev => ({ ...prev, protectionTsd: value }));
                          }}
                        />
                      </div>

                      {/* Ii (Instantaneous) */}
                      <div className="space-y-2">
                        <Label htmlFor="edit-protection-ii">Ii (Instantaneous)</Label>
                        <Input
                          id="edit-protection-ii"
                          type="number"
                          min="2.0"
                          max="10.0"
                          step="0.1"
                          placeholder="2.0 - 10.0"
                          value={editableSettings.protectionIi ?? ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : e.target.value;
                            setEditableSettings(prev => ({ ...prev, protectionIi: value }));
                          }}
                        />
                      </div>

                      {/* Ig */}
                      <div className="space-y-2">
                        <Label htmlFor="edit-protection-ig">Ig</Label>
                        <Select
                          value={editableSettings.protectionIg ?? 'none'}
                          onValueChange={(value) => {
                            // Use "none" as a special value to represent undefined
                            const newValue = value === 'none' ? undefined : (value as 'A' | 'B' | 'C' | 'D' | 'E' | 'F');
                            setEditableSettings(prev => ({ ...prev, protectionIg: newValue }));
                          }}
                        >
                          <SelectTrigger id="edit-protection-ig">
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
                        <Label htmlFor="edit-protection-tg">tg(s)</Label>
                        <Input
                          id="edit-protection-tg"
                          type="number"
                          min="0.1"
                          max="0.4"
                          step="0.1"
                          placeholder="0.1 - 0.4"
                          value={editableSettings.protectionTg ?? ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : e.target.value;
                            setEditableSettings(prev => ({ ...prev, protectionTg: value }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Single Save Changes Button for all settings (breaker rating, unit cost, and protection settings) */}
                {isAdmin && (
                  <div className="flex justify-end pt-4 border-t">
                    <Button 
                      onClick={handleSaveSettings} 
                      disabled={isSaving}
                      className="min-w-[120px]"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div className="space-y-0.5">
                    <Label htmlFor="includeInTotal" className="text-base">Include in Total Power Summary</Label>
                    <p className="text-sm text-muted-foreground">
                      When enabled, this device's power consumption will contribute to the main dashboard's total power calculation
                    </p>
                  </div>
                  <Switch
                    id="includeInTotal"
                    checked={device.includeInTotalSummary}
                    onCheckedChange={(checked) => {
                      onUpdateDevice({ ...device, includeInTotalSummary: checked });
                      toast.success(checked ? 'Device included in total summary' : 'Device excluded from total summary');
                    }}
                  />
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    disabled={testingConnection}
                    onClick={async () => {
                      if (!device.ipAddress) {
                        toast.error('No IP address configured for this device.');
                        return;
                      }
                      setTestingConnection(true);
                      try {
                        const result = await api.testDeviceConnection(device.ipAddress, device.slaveAddress ?? 1);
                        if (result.success) {
                          toast.success(result.message || `Connected to ${device.ipAddress}`);
                        } else {
                          toast.error(result.error || `Cannot reach ${device.ipAddress}:502`);
                        }
                      } catch (err: any) {
                        toast.error(err?.message || 'Failed to test connection');
                      } finally {
                        setTestingConnection(false);
                      }
                    }}
                  >
                    {testingConnection ? (
                      <>
                        <Activity className="w-4 h-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Settings className="w-4 h-4 mr-2" />
                        Test Connection
                      </>
                    )}
                  </Button>
                  <Button variant="outline">
                    Reconfigure Network
                  </Button>
                </div>

                {isAdmin && (
                  <div className="pt-6 border-t border-border">
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-destructive mb-2">Danger Zone</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Permanently delete this device and all associated historical data. This action cannot be undone.
                        </p>
                      </div>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Device
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the device <strong>{device.name}</strong> and all its historical records from the database. 
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDeleteDevice(device.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete Device
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}