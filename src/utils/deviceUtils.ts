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

