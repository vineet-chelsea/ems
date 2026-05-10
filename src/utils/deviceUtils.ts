import { Activity, Cpu, Gauge, Shield, Zap } from "lucide-react";

/**
 * Get display name for device type
 * Maps internal device types to user-friendly display names
 */
export function getDeviceTypeDisplayName(type: string): string {
  if (type === 'PM5320') {
    return 'PM513x,PM532x,PM53xx';
  }
  return type;
}

export function getDeviceTypeIcon(type: string) {
  switch (type) {
    case 'PM5320':
      return Gauge;
    case 'PM8000':
      return Zap;
    case 'MICROLOGIC_6E':
      return Shield;
    case 'EM6400':
      return Cpu;
    default:
      return Activity;
  }
}

