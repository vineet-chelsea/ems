/**
 * Time windows for device parameter charts and related dashboards (Power Quality events, etc.).
 * All ranges use the browser's local calendar / local midnight unless noted.
 */

export type ChartPeriodOption =
  | 'today'
  | '24-hours'
  | 'this-week'
  | '7-days'
  | '30-days'
  | '12-months';

export interface ChartPeriodRange {
  startTime: Date;
  endTime: Date;
}

/** Start of local calendar day for `d`. */
function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Most recent Monday 00:00:00 local time on or before `d`.
 * Week starts Monday; Sunday maps to the previous Monday.
 */
function startOfLocalWeekMonday(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay(); // 0 Sun … 6 Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Inclusive window [startTime, endTime] for charts; endTime is always `now` (or passed `end`). */
export function getChartPeriodTimeRange(
  period: ChartPeriodOption,
  end: Date = new Date()
): ChartPeriodRange {
  const endTime = new Date(end);
  switch (period) {
    case 'today':
      return { startTime: startOfLocalDay(endTime), endTime };
    case '24-hours':
      return {
        startTime: new Date(endTime.getTime() - 24 * 60 * 60 * 1000),
        endTime,
      };
    case 'this-week':
      return { startTime: startOfLocalWeekMonday(endTime), endTime };
    case '7-days':
      return {
        startTime: new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000),
        endTime,
      };
    case '30-days':
      return {
        startTime: new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000),
        endTime,
      };
    case '12-months':
      return {
        startTime: new Date(endTime.getTime() - 365 * 24 * 60 * 60 * 1000),
        endTime,
      };
    default:
      return {
        startTime: new Date(endTime.getTime() - 24 * 60 * 60 * 1000),
        endTime,
      };
  }
}

export function getChartWindowStartMs(period: ChartPeriodOption, endMs: number = Date.now()): number {
  return getChartPeriodTimeRange(period, new Date(endMs)).startTime.getTime();
}
