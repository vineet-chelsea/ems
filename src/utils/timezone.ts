/**
 * Timezone utilities for IST (Indian Standard Time)
 * IST is UTC+5:30 (Asia/Kolkata)
 * 
 * This ensures all timestamps are displayed in IST across the frontend
 */

/**
 * Application timezone constant - IST (Asia/Kolkata)
 */
export const APP_TIMEZONE = 'Asia/Kolkata';

/**
 * Format a date/timestamp to IST timezone string
 */
export function formatIST(timestamp: Date | string | number): string {
  const date = typeof timestamp === 'string' || typeof timestamp === 'number' 
    ? new Date(timestamp) 
    : timestamp;
  
  return date.toLocaleString('en-IN', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * Format a date to IST with 12-hour format (AM/PM)
 */
export function formatIST12Hour(timestamp: Date | string | number): string {
  const date = typeof timestamp === 'string' || typeof timestamp === 'number' 
    ? new Date(timestamp) 
    : timestamp;
  
  return date.toLocaleString('en-IN', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Get current time in IST
 */
export function getCurrentIST(): Date {
  return new Date();
}

/**
 * Convert a date string to Date object (interpreted as IST)
 */
export function parseISTDate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Format date for display (short format)
 */
export function formatISTShort(timestamp: Date | string | number): string {
  const date = typeof timestamp === 'string' || typeof timestamp === 'number' 
    ? new Date(timestamp) 
    : timestamp;
  
  return date.toLocaleString('en-IN', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

