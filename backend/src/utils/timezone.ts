/**
 * Timezone utilities for IST (Indian Standard Time)
 * IST is UTC+5:30 (Asia/Kolkata)
 * 
 * IMPORTANT: The application timezone is set to IST at startup (process.env.TZ = 'Asia/Kolkata')
 * All Date objects will automatically use IST timezone.
 */

/**
 * Application timezone constant - IST (Asia/Kolkata)
 */
export const APP_TIMEZONE = 'Asia/Kolkata';

/**
 * Convert a Date to IST timezone string
 * Since TZ is set to Asia/Kolkata, this just formats the date
 */
export function toISTString(date: Date): string {
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
 * Get current time (already in IST since TZ is set)
 */
export function getCurrentIST(): Date {
  return new Date(); // Already in IST due to TZ environment variable
}

/**
 * Format timestamp for display in IST
 */
export function formatIST(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
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
 * Get IST timezone offset in hours
 */
export function getISTOffset(): number {
  return 5.5; // IST is UTC+5:30
}

/**
 * Ensure a date is interpreted as IST
 * Since TZ is set, this is mainly for clarity
 */
export function toISTDate(date: Date | string): Date {
  return typeof date === 'string' ? new Date(date) : date;
}

