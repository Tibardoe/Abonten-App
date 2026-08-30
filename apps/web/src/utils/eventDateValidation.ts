import type { DateRange } from "react-day-picker";

export type DateEntry = { start: Date; end: Date };

// Organizers must give attendees enough notice -- events can't be posted to
// start (or end) less than 5 hours from the moment they submit. Previously
// duplicated verbatim between useEventUploadForm and useEventEditForm's
// onSubmit; extracted here so create and edit can never drift out of sync.
const BUFFER_MS = 5 * 60 * 60 * 1000;

export function getBufferedNow(): Date {
  return new Date(Date.now() + BUFFER_MS);
}

export type DateValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateSingleDateRange(
  range: DateRange | undefined,
  bufferedNow: Date = getBufferedNow(),
): DateValidationResult {
  const start = range?.from ? new Date(range.from) : undefined;
  const end = range?.to ? new Date(range.to) : undefined;

  if (!start || !end) {
    return { ok: false, message: "Please select both start and end date" };
  }
  if (start <= bufferedNow || end <= bufferedNow) {
    return {
      ok: false,
      message: "Start or end time must be at least 5 hours from now",
    };
  }
  if (start >= end) {
    return { ok: false, message: "Start time must be earlier than end time" };
  }

  return { ok: true };
}

export function validateSpecificDates(
  entries: DateEntry[] | undefined,
  bufferedNow: Date = getBufferedNow(),
): DateValidationResult {
  if (!entries || entries.length === 0) {
    return { ok: false, message: "Please select at least one date" };
  }

  // Names the offending entry ("Date 2 must be at least 5 hours from now")
  // rather than a blanket message across the whole list, so an organizer
  // with several dates added knows exactly which one to fix.
  const invalidIndex = entries.findIndex(
    (entry) =>
      new Date(entry.start) <= bufferedNow ||
      new Date(entry.end) <= bufferedNow,
  );
  if (invalidIndex !== -1) {
    return {
      ok: false,
      message:
        entries.length === 1
          ? "The selected date must be at least 5 hours from now"
          : `Date ${invalidIndex + 1} must be at least 5 hours from now`,
    };
  }

  return { ok: true };
}
