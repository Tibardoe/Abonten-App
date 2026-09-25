// Week arithmetic for Abonten Weekly. A week is a calendar week (Monday to
// Sunday) in the ZONE of the edition's area — its market's zone — so a
// London edition turns over at midnight London time, across daylight-saving
// changes. Every instant-taking function accepts that zone; the default
// "UTC" is also Ghana's calendar (UTC+0 all year), which is what the first
// market's editions have always used. Dates (yyyy-mm-dd) are zone-free.
// The SQL twin is weekly_edition_view, which reads the scope market's zone.

import { instantToWallClock, wallClockToInstant } from "../time/timeZone";

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

/** Today's date in `timeZone`, yyyy-mm-dd. */
export function todayIn(now: Date = new Date(), timeZone = "UTC"): string {
  return instantToWallClock(now, timeZone).date;
}

/** @deprecated The first market's calendar; use todayIn(now, zone). */
export function accraToday(now: Date = new Date()): string {
  return todayIn(now, "UTC");
}

/** The instant a local date starts in `timeZone`. */
function localMidnight(isoDate: string, timeZone: string): Date {
  return (
    wallClockToInstant(isoDate, "00:00", timeZone) ?? toUtcMidnight(isoDate)
  );
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(toUtcMidnight(isoDate).getTime() + days * DAY_MS));
}

/**
 * The Monday (yyyy-mm-dd) of the ISO week containing `date` — a date
 * string, or an instant read on `timeZone`'s calendar.
 */
export function weekStartFor(
  date: Date | string = new Date(),
  timeZone = "UTC",
): string {
  const day =
    typeof date === "string"
      ? toUtcMidnight(date.slice(0, 10))
      : toUtcMidnight(todayIn(date, timeZone));
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
export function nextWeekStart(
  now: Date = new Date(),
  timeZone = "UTC",
): string {
  return addDays(weekStartFor(now, timeZone), 7);
}

/** True once the whole week (through Sunday 23:59:59 local) is over. */
export function isWeekOver(
  weekStart: string,
  now: Date = new Date(),
  timeZone = "UTC",
): boolean {
  return (
    localMidnight(addDays(weekStart, 7), timeZone).getTime() <= now.getTime()
  );
}

/** Start and end instants (ISO) of the week, for "happening this week" reads. */
export function weekWindow(
  weekStart: string,
  timeZone = "UTC",
): { start: string; end: string } {
  return {
    start: localMidnight(weekStart, timeZone).toISOString(),
    end: new Date(
      localMidnight(addDays(weekStart, 7), timeZone).getTime() - 1,
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

/** ISO instant for `hour`:00 local on the edition's Monday. */
export function defaultScheduleFor(
  weekStart: string,
  hourLocal: number,
  timeZone = "UTC",
): string {
  const hour = Math.min(Math.max(Math.trunc(hourLocal), 0), 23);
  const at =
    wallClockToInstant(
      weekStart,
      `${String(hour).padStart(2, "0")}:00`,
      timeZone,
    ) ?? new Date(toUtcMidnight(weekStart).getTime() + hour * 3_600_000);
  return at.toISOString();
}

/** Value for an <input type="datetime-local"> showing `timeZone`'s clock. */
export function toZoneInputValue(iso: string, timeZone = "UTC"): string {
  const w = instantToWallClock(new Date(iso), timeZone);
  return `${w.date}T${w.time}`;
}

/** Parse an <input type="datetime-local"> value entered on `timeZone`'s clock. */
export function fromZoneInputValue(
  value: string,
  timeZone = "UTC",
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [date, time] = value.split("T");
  const at = wallClockToInstant(date, time, timeZone);
  return at ? at.toISOString() : null;
}

/** @deprecated Use toZoneInputValue(iso, zone). */
export function toAccraInputValue(iso: string): string {
  return toZoneInputValue(iso, "UTC");
}

/** @deprecated Use fromZoneInputValue(value, zone). */
export function fromAccraInputValue(value: string): string | null {
  return fromZoneInputValue(value, "UTC");
}
