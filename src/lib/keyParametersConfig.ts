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
