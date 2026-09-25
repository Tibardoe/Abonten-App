import type { Occurrence } from "@abonten/types/occurrenceType";
import { formatDistance } from "date-fns";
import {
  isValidTimeZone,
  viewerTimeZone,
  zoneAbbreviation,
  zoneOffsetMinutes,
} from "./time/timeZone";

// Every formatter here takes an optional IANA time zone. Pass the EVENT's
// zone (event.timezone) for anything about when an event happens, so a
// person in London reads a Lagos event at Lagos time with no surprise;
// leave it out for the viewer's own moments (receipts, activity). An
// invalid zone falls back to the viewer's, never throws.

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Parts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hours: number;
  minutes: number;
};

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? "";
  const cached = partsFormatterCache.get(key);
  if (cached) return cached;
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
  } catch {
    f = partsFormatter(undefined);
  }
  partsFormatterCache.set(key, f);
  return f;
}

/** The wall-clock parts of `date` in `timeZone` (viewer's zone when omitted). */
export function wallClockParts(
  date: Date | string,
  timeZone?: string | null,
): Parts {
  const d = date instanceof Date ? date : new Date(date);
  if (!timeZone) {
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
      weekday: d.getDay(),
      hours: d.getHours(),
      minutes: d.getMinutes(),
    };
  }
  const out: Parts = {
    year: 0,
    month: 0,
    day: 0,
    weekday: 0,
    hours: 0,
    minutes: 0,
  };
  for (const part of partsFormatter(timeZone).formatToParts(d)) {
    switch (part.type) {
      case "year":
        out.year = Number(part.value);
        break;
      case "month":
        out.month = Number(part.value) - 1;
        break;
      case "day":
        out.day = Number(part.value);
        break;
      case "weekday":
        out.weekday = Math.max(0, DAYS_SHORT.indexOf(part.value));
        break;
      case "hour":
        out.hours = Number(part.value) % 24;
        break;
      case "minute":
        out.minutes = Number(part.value);
        break;
    }
  }
  return out;
}

/**
 * " WAT" when `timeZone` keeps a different clock from the viewer's at `at`
 * (a Lagos event seen from London), "" otherwise — so a time is never read
 * in the wrong zone, and people at home see no clutter.
 */
export function zoneHint(
  at: Date | string,
  timeZone?: string | null,
  viewer: string = viewerTimeZone(),
): string {
  if (!timeZone || !isValidTimeZone(timeZone)) return "";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  if (viewer === timeZone) return "";
  if (zoneOffsetMinutes(d, viewer) === zoneOffsetMinutes(d, timeZone))
    return "";
  return ` ${zoneAbbreviation(d, timeZone)}`;
}

function ordinal(day: number): string {
  if (day % 10 === 1 && day !== 11) return "st";
  if (day % 10 === 2 && day !== 12) return "nd";
  if (day % 10 === 3 && day !== 13) return "rd";
  return "th";
}

function twelveHour(hours: number, minutes: number): string {
  const h = hours % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function formatDateWithSuffix(
  date: string | Date,
  timeZone?: string | null,
): string {
  const p = wallClockParts(date, timeZone);
  return `${p.day}${ordinal(p.day)} ${MONTHS_SHORT[p.month]} ${p.year}`;
}

export function formatFullDateTimeRange(
  from?: Date | null | string,
  to?: Date | null | string,
  timeZone?: string | null,
): { date: string; time: string } {
  const fromObj = from
    ? formatSingleDateTime(from, timeZone)
    : { date: "N/A", time: "N/A" };
  const toObj = to
    ? formatSingleDateTime(to, timeZone)
    : { date: "N/A", time: "N/A" };

  const isSameDate = fromObj.date === toObj.date;

  const hint = from ? zoneHint(from, timeZone) : "";
  return {
    date: isSameDate ? fromObj.date : `${fromObj.date} - ${toObj.date}`,
    time: `${fromObj.time} - ${toObj.time}${hint}`,
  };
}

export function formatSingleDateTime(
  date: Date | string,
  timeZone?: string | null,
): {
  date: string;
  time: string;
} {
  const p = wallClockParts(date, timeZone);
  return {
    date: `${DAYS_SHORT[p.weekday]}, ${p.day}${ordinal(p.day)} ${MONTHS_SHORT[p.month]} ${p.year}`,
    time: twelveHour(p.hours, p.minutes),
  };
}

/**
 * "5 minutes ago" for a moment that has already happened. Every caller passes
 * a past timestamp (created, edited, last message, activity), so a time a
 * little in the future can only be clock skew: the server stamped it and the
 * device's clock is behind. Without the clamp that read "in less than a
 * minute" on a message that had just arrived.
 */
export function getRelativeTime(date: string | Date, now: Date = new Date()) {
  const at = new Date(date);
  const past = at.getTime() > now.getTime() ? now : at;
  return formatDistance(past, now, { addSuffix: true }).replace("about ", "");
}

export function formatSpecificDateWithTimeRange(
  item: { date: Date; from: Date; to: Date },
  timeZone?: string | null,
): string {
  const dateStr = formatSingleDateTime(item.date, timeZone).date;
  const fromTime = formatSingleDateTime(item.from, timeZone).time;
  const toTime = formatSingleDateTime(item.to, timeZone).time;
  return `${dateStr} ${fromTime} - ${toTime}`;
}

export function getDateParts(
  dateInput: string | Date,
  timeZone?: string | null,
) {
  const p = wallClockParts(dateInput, timeZone);
  return {
    day: DAYS_LONG[p.weekday],
    month: MONTHS_LONG[p.month],
    date: p.day,
    time: twelveHour(p.hours, p.minutes),
  };
}

/**
 * Picks which occurrence/date range represents "the event" right now: the
 * next future-or-current occurrence, else the main starts_at/ends_at if
 * still future, else the most recent past occurrence, else the main
 * starts_at/ends_at even if past. Returns null only if the event has
 * neither occurrences nor starts_at/ends_at at all (not enforced by a DB
 * constraint, so this is a real possible state, not defensive dead code).
 * Single decision point reused by both getFormattedEventDate (display) and
 * resolveEventEndDate (raw Date, e.g. for ticket expiry) so the two can
 * never disagree about which date range "the event" resolves to.
 */
function resolveEventDateRange(
  startsAt: string | Date | null | undefined,
  endsAt: string | Date | null | undefined,
  fallbackOccurrences?: Occurrence[] | null,
): { starts: Date; ends: Date } | null {
  const now = new Date().getTime();

  // 1. Try to find a FUTURE or CURRENT occurrence
  if (fallbackOccurrences && fallbackOccurrences.length > 0) {
    const nextOccurrence = fallbackOccurrences
      .filter((occ) => new Date(occ.ends_at).getTime() > now)
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      )[0];

    if (nextOccurrence) {
      return {
        starts: new Date(nextOccurrence.starts_at),
        ends: new Date(nextOccurrence.ends_at),
      };
    }
  }

  // 2. If no future occurrences, try the main startsAt (if it's in the future)
  if (startsAt && endsAt) {
    if (new Date(endsAt).getTime() > now) {
      return { starts: new Date(startsAt), ends: new Date(endsAt) };
    }
  }

  // 3. FALLBACK: If EVERYTHING is in the past, use the very last occurrence
  // so the card still shows the date it happened.
  if (fallbackOccurrences && fallbackOccurrences.length > 0) {
    const lastOccurrence = fallbackOccurrences.sort(
      (a, b) =>
        new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
    )[0]; // Note: sorted by latest first

    return {
      starts: new Date(lastOccurrence.starts_at),
      ends: new Date(lastOccurrence.ends_at),
    };
  }

  // 4. Final Fallback for single events that are past
  if (startsAt && endsAt) {
    return { starts: new Date(startsAt), ends: new Date(endsAt) };
  }

  return null;
}

/**
 * Compact single-line date/time for a discovery card, per the mobile card
 * spec: always show ONE date — the first upcoming occurrence for a
 * multi-date event, the "from" day for a multi-day range, or the single day
 * — plus its start time, never a "from – to" span (those don't fit a card
 * and get truncated to noise). `extraDates` is how many further dates exist
 * beyond the one shown, so the card can add a quiet "+N dates" hint instead
 * of concatenating them. The year is included only when it isn't the
 * current year.
 */
export function getEventCardDateTime(
  startsAt: string | Date | null | undefined,
  endsAt: string | Date | null | undefined,
  fallbackOccurrences?: Occurrence[] | null,
  /** The event's zone (event.timezone): the card reads the venue's clock. */
  timeZone?: string | null,
): { date: string; time: string; extraDates: number } {
  const range = resolveEventDateRange(startsAt, endsAt, fallbackOccurrences);
  if (!range) return { date: "Date TBC", time: "", extraDates: 0 };

  const s = range.starts;
  const p = wallClockParts(s, timeZone);
  const nowYear = wallClockParts(new Date(), timeZone).year;
  const date = `${DAYS_SHORT[p.weekday]}, ${p.day} ${MONTHS_SHORT[p.month]}${
    p.year === nowYear ? "" : ` ${p.year}`
  }`;
  const h12 = p.hours % 12 || 12;
  const time = `${h12}:${String(p.minutes).padStart(2, "0")} ${p.hours >= 12 ? "PM" : "AM"}${zoneHint(s, timeZone)}`;

  // How many *other* dates this event has beyond the one shown.
  const occCount = fallbackOccurrences?.length ?? 0;
  let extraDates = occCount > 1 ? occCount - 1 : 0;
  if (extraDates === 0) {
    // A single multi-day range still "has more than one date" to a reader.
    const e = wallClockParts(range.ends, timeZone);
    const spansDays =
      e.year !== p.year || e.month !== p.month || e.day !== p.day;
    if (spansDays) extraDates = 1;
  }

  return { date, time, extraDates };
}

export function getFormattedEventDate(
  startsAt: string | Date | null | undefined,
  endsAt: string | Date | null | undefined,
  fallbackOccurrences?: Occurrence[] | null,
  /** The event's zone (event.timezone). */
  timeZone?: string | null,
): { date: string; time: string } {
  const range = resolveEventDateRange(startsAt, endsAt, fallbackOccurrences);

  if (!range) {
    return {
      date: "Date not available",
      time: "Time not available",
    };
  }

  return formatFullDateTimeRange(range.starts, range.ends, timeZone);
}

/**
 * Raw-Date equivalent of getFormattedEventDate's resolution logic, for
 * callers that need an actual Date (e.g. ticket.expires_at) rather than a
 * display string. Returns null in the same case getFormattedEventDate falls
 * back to "Date not available" — callers must handle that explicitly rather
 * than inserting an invalid date.
 */
export function resolveEventEndDate(
  startsAt: string | Date | null | undefined,
  endsAt: string | Date | null | undefined,
  fallbackOccurrences?: Occurrence[] | null,
): Date | null {
  const range = resolveEventDateRange(startsAt, endsAt, fallbackOccurrences);
  return range ? range.ends : null;
}
