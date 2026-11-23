import { formatDate } from "./i18n/format";
import type { CoreTranslator } from "./i18n/translator";
import { normalizePlainNote, plainNoteProblem } from "./plainNote";
import {
  addCalendarDays,
  instantToWallClock,
  isValidTimeZone,
} from "./time/timeZone";

// Special dates in a place's opening hours (PROJECT.md §90): a holiday or
// an event day on which the place is closed, or open at other times than
// on that weekday. One row per place and date of the PLACE's calendar
// (place.timezone), in place_special_hours. It replaces that date's weekday
// hours, and only that date's — computePlaceOpenStatus and the SQL
// place_is_open_now read them the same way.

export type PlaceSpecialHourRow = {
  id?: string;
  /** "yyyy-mm-dd" on the place's own calendar. */
  special_date: string;
  /** "HH:MM" or "HH:MM:SS"; null when closed. */
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  /** An optional name ("Christmas Day"). */
  label: string | null;
};

/** The longest name a special date may have (the database CHECK too). */
export const SPECIAL_HOURS_LABEL_MAX = 60;
/** The public place page shows the special dates of the next 30 days. */
export const SPECIAL_HOURS_PUBLIC_DAYS = 30;
/** A special date may be set up to a year ahead. */
export const SPECIAL_HOURS_MAX_AHEAD_DAYS = 366;
/** At most this many upcoming special dates per place. */
export const SPECIAL_HOURS_MAX_UPCOMING = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Today's date ("yyyy-mm-dd") at the place: on its own calendar when its
 * zone is known, else on the device's.
 */
export function placeLocalDate(now: Date, timeZone?: string | null): string {
  if (timeZone && isValidTimeZone(timeZone)) {
    return instantToWallClock(now, timeZone).date;
  }
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** True for a real calendar day written "yyyy-mm-dd" (not 2026-02-30). */
export function isCalendarDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    DATE_RE.test(value) &&
    addCalendarDays(value, 0) === value
  );
}

/** The weekday (0 Sunday … 6 Saturday) of a "yyyy-mm-dd" day. */
export function calendarDateWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * "Fri, 25 Dec" in the reader's language for a "yyyy-mm-dd" day of the
 * place's calendar. Written as that day at noon UTC and formatted in UTC,
 * so it never moves to the day before or after on a device elsewhere.
 */
export function formatSpecialDate(
  date: string,
  locale?: string | null,
): string {
  const [y, m, d] = date.split("-").map(Number);
  return formatDate(new Date(Date.UTC(y, m - 1, d, 12)), locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The special dates from today (at the place) for `days` days, soonest
 * first — what the public place page lists.
 */
export function upcomingSpecialHours<T extends PlaceSpecialHourRow>(
  rows: readonly T[] | null | undefined,
  now: Date,
  timeZone?: string | null,
  days: number = SPECIAL_HOURS_PUBLIC_DAYS,
): T[] {
  const today = placeLocalDate(now, timeZone);
  const end = addCalendarDays(today, days);
  return (rows ?? [])
    .filter((row) => row.special_date >= today && row.special_date < end)
    .sort((a, b) => a.special_date.localeCompare(b.special_date));
}

export type SpecialHoursInput = {
  /** "yyyy-mm-dd" on the place's calendar. */
  date: string;
  isClosed: boolean;
  /** "HH:MM"; ignored when closed. */
  openTime?: string | null;
  closeTime?: string | null;
  label?: string | null;
};

export type SpecialHoursProblem =
  | "date_invalid"
  | "date_past"
  | "date_too_far"
  | "times_required"
  | "label_too_long"
  | "label_link";

/** The row as it is stored, from what the owner typed. */
export function normalizeSpecialHours(input: SpecialHoursInput): {
  special_date: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  label: string | null;
} {
  const isClosed = input.isClosed === true;
  return {
    special_date: input.date,
    is_closed: isClosed,
    open_time: isClosed ? null : (input.openTime ?? null),
    close_time: isClosed ? null : (input.closeTime ?? null),
    label: normalizePlainNote(input.label),
  };
}

/**
 * What is wrong with a special date the owner is adding, or null. `now` and
 * the place's zone decide what "today" is: a date before it is refused
 * (today itself is allowed: an unexpected closure).
 */
export function specialHoursProblem(
  input: SpecialHoursInput,
  now: Date,
  timeZone?: string | null,
): SpecialHoursProblem | null {
  if (!isCalendarDate(input.date)) return "date_invalid";
  const today = placeLocalDate(now, timeZone);
  if (input.date < today) return "date_past";
  if (input.date > addCalendarDays(today, SPECIAL_HOURS_MAX_AHEAD_DAYS)) {
    return "date_too_far";
  }
  if (
    !input.isClosed &&
    (!TIME_RE.test(input.openTime ?? "") ||
      !TIME_RE.test(input.closeTime ?? ""))
  ) {
    return "times_required";
  }
  const labelProblem = plainNoteProblem(
    normalizePlainNote(input.label),
    SPECIAL_HOURS_LABEL_MAX,
  );
  if (labelProblem === "too_long") return "label_too_long";
  if (labelProblem === "link") return "label_link";
  return null;
}

export function specialHoursProblemMessage(
  t: CoreTranslator,
  problem: SpecialHoursProblem | "too_many",
): string {
  switch (problem) {
    case "date_invalid":
      return t("specialHours.dateInvalid");
    case "date_past":
      return t("specialHours.datePast");
    case "date_too_far":
      return t("specialHours.dateTooFar");
    case "times_required":
      return t("specialHours.timesRequired");
    case "label_too_long":
      return t("specialHours.labelTooLong", { max: SPECIAL_HOURS_LABEL_MAX });
    case "label_link":
      return t("specialHours.labelLink");
    case "too_many":
      return t("specialHours.tooMany", { max: SPECIAL_HOURS_MAX_UPCOMING });
  }
}
