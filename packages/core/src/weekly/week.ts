// Week arithmetic for Abonten Weekly. Ghana (Africa/Accra) is UTC+0 all year
// with no daylight saving, so an Accra calendar day is a UTC calendar day and
// plain UTC date maths is exact here (same rule as organizerDashboardDateRange).
// The SQL twin is `week_start` (isodow = 1) and `at time zone 'Africa/Accra'`
// in supabase/migrations/20260913120000_weekly_core.sql.

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toUtcMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True for a real calendar date written yyyy-mm-dd. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = toUtcMidnight(value);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
}

/** Today's date in Accra, yyyy-mm-dd. */
export function accraToday(now: Date = new Date()): string {
  return toIsoDate(now);
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(toUtcMidnight(isoDate).getTime() + days * DAY_MS));
}

/** The Monday (yyyy-mm-dd) of the ISO week containing `date`. */
export function weekStartFor(date: Date | string = new Date()): string {
  const day =
    typeof date === "string"
      ? toUtcMidnight(date.slice(0, 10))
      : toUtcMidnight(toIsoDate(date));
  // getUTCDay: Sunday 0 .. Saturday 6. ISO weeks start on Monday.
  const isoDow = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
  return addDays(toIsoDate(day), 1 - isoDow);
}

export function isWeekStart(isoDate: string): boolean {
  return isIsoDate(isoDate) && weekStartFor(isoDate) === isoDate;
}

/** The Sunday (yyyy-mm-dd) that ends the week starting `weekStart`. */
export function weekEndFor(weekStart: string): string {
  return addDays(weekStart, 6);
}

/** Monday of next week. */
export function nextWeekStart(now: Date = new Date()): string {
  return addDays(weekStartFor(now), 7);
}

/** True once the whole week (through Sunday 23:59:59 Accra) is over. */
export function isWeekOver(weekStart: string, now: Date = new Date()): boolean {
  return toUtcMidnight(addDays(weekStart, 7)).getTime() <= now.getTime();
}

/** Start and end instants (ISO) of the week, for "happening this week" reads. */
export function weekWindow(weekStart: string): { start: string; end: string } {
  return {
    start: toUtcMidnight(weekStart).toISOString(),
    end: new Date(
      toUtcMidnight(addDays(weekStart, 7)).getTime() - 1,
    ).toISOString(),
  };
}

/**
 * "15–21 September 2026", "29 September – 5 October 2026",
 * "29 December 2026 – 4 January 2027".
 */
export function formatWeekRange(weekStart: string, locale = "en-GB"): string {
  const start = toUtcMidnight(weekStart);
  const end = toUtcMidnight(weekEndFor(weekStart));
  const opts = { timeZone: "UTC" } as const;
  const day = (d: Date) =>
    new Intl.DateTimeFormat(locale, { ...opts, day: "numeric" }).format(d);
  const month = (d: Date) =>
    new Intl.DateTimeFormat(locale, { ...opts, month: "long" }).format(d);
  const year = (d: Date) =>
    new Intl.DateTimeFormat(locale, { ...opts, year: "numeric" }).format(d);

  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${day(start)} ${month(start)} ${year(start)} – ${day(end)} ${month(end)} ${year(end)}`;
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) {
    return `${day(start)} ${month(start)} – ${day(end)} ${month(end)} ${year(end)}`;
  }
  return `${day(start)}–${day(end)} ${month(end)} ${year(end)}`;
}

/** ISO instant for `hour`:00 Accra on the edition's Monday. */
export function defaultScheduleFor(
  weekStart: string,
  hourLocal: number,
): string {
  const hour = Math.min(Math.max(Math.trunc(hourLocal), 0), 23);
  return new Date(
    toUtcMidnight(weekStart).getTime() + hour * 3_600_000,
  ).toISOString();
}

/** Value for an <input type="datetime-local"> showing Accra time. */
export function toAccraInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

/** Parse an <input type="datetime-local"> value entered in Accra time. */
export function fromAccraInputValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
