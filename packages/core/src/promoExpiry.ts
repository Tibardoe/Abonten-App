import {
  addCalendarDays,
  calendarDayOf,
  startOfCalendarDay,
} from "./time/timeZone";

// A promo code's `expires_at` names its LAST VALID DAY: a date picker writes
// the day ("until Wed, Sep 30"), stored as that day's midnight with no zone
// (`timestamp without time zone`). The day is the event's calendar day, so
// the code stops working at midnight in the event's zone at the end of it.
// Until 2026-09-26 both ends used UTC — correct in Ghana (UTC+0), an hour
// or more off anywhere else.

/**
 * The value to store for a submitted expiry: the calendar day it names in
 * the event's zone, at midnight, with no zone. An instant (a browser's
 * local midnight sent as "...Z") is read in the event's zone; a bare date is
 * taken as written. Null when the input is not a date.
 */
export function promoExpiryForStorage(
  value: string | Date | null | undefined,
  eventTimeZone: string,
): string | null {
  const day = calendarDayOf(value, eventTimeZone);
  return day ? `${day}T00:00:00` : null;
}

/** The instant a stored expiry stops the code working. */
export function promoExpiryCutoff(
  expiresAt: string,
  eventTimeZone = "UTC",
): Date {
  const day = calendarDayOf(expiresAt, eventTimeZone);
  const cutoff = day
    ? startOfCalendarDay(addCalendarDays(day, 1), eventTimeZone)
    : null;
  // Unparseable: the old strict reading, never a longer life.
  return cutoff ?? new Date(expiresAt);
}
