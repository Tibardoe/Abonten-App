import type { Occurrence } from "@/types/occurrenceType";
import { formatDistanceToNow } from "date-fns";

export function formatDateWithSuffix(date: string | Date): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const formattedDate = new Date(date).toLocaleDateString("en-GB", options);

  const day = new Date(date).getDate();
  let suffix = "th";

  if (day % 10 === 1 && day !== 11) {
    suffix = "st";
  } else if (day % 10 === 2 && day !== 12) {
    suffix = "nd";
  } else if (day % 10 === 3 && day !== 13) {
    suffix = "rd";
  }

  // Replace the day number with day + suffix
  return formattedDate.replace(/\d+/, `${day}${suffix}`);
}

export function formatFullDateTimeRange(
  from?: Date | null | string,
  to?: Date | null | string,
): { date: string; time: string } {
  const fromObj = from
    ? formatSingleDateTime(from)
    : { date: "N/A", time: "N/A" };
  const toObj = to ? formatSingleDateTime(to) : { date: "N/A", time: "N/A" };

  const isSameDate = fromObj.date === toObj.date;

  return {
    date: isSameDate ? fromObj.date : `${fromObj.date} - ${toObj.date}`,
    time: `${fromObj.time} - ${toObj.time}`,
  };
}

export function formatSingleDateTime(date: Date | string): {
  date: string;
  time: string;
} {
  const parsedDate = new Date(date);

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const months = [
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

  const dayOfWeek = daysOfWeek[parsedDate.getDay()];
  const month = months[parsedDate.getMonth()];
  const day = parsedDate.getDate();
  const year = parsedDate.getFullYear();

  let suffix = "th";
  if (day % 10 === 1 && day !== 11) suffix = "st";
  else if (day % 10 === 2 && day !== 12) suffix = "nd";
  else if (day % 10 === 3 && day !== 13) suffix = "rd";

  const formattedDate = `${dayOfWeek}, ${day}${suffix} ${month} ${year}`;

  const timeStr = parsedDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return { date: formattedDate, time: timeStr };
}

export function getRelativeTime(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true }).replace(
    "about ",
    "",
  );
}

export function formatSpecificDateWithTimeRange(item: {
  date: Date;
  from: Date;
  to: Date;
}): string {
  const dateStr = formatSingleDateTime(item.date).date;

  const fromTime = item.from.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const toTime = item.to.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `${dateStr} ${fromTime} - ${toTime}`;
}

export function getDateParts(dateInput: string | Date) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;

  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const months = [
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

  const day = daysOfWeek[date.getDay()];
  const month = months[date.getMonth()];
  const dateNum = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();

  const formattedTime = `${hours % 12 || 12}:${minutes
    .toString()
    .padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;

  return {
    day,
    month,
    date: dateNum,
    time: formattedTime,
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

export function getFormattedEventDate(
  startsAt: string | Date | null | undefined,
  endsAt: string | Date | null | undefined,
  fallbackOccurrences?: Occurrence[] | null,
): { date: string; time: string } {
  const range = resolveEventDateRange(startsAt, endsAt, fallbackOccurrences);

  if (!range) {
    return {
      date: "Date not available",
      time: "Time not available",
    };
  }

  return formatFullDateTimeRange(range.starts, range.ends);
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
