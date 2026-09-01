// Shared event date/time validation — used by the web create/edit event
// forms and the native event-creation wizard, so the "how much notice must
// an organizer give" rule and the range checks can never drift between
// platforms. Framework-free (no react-day-picker import — the range shape
// is inlined).

export type DateEntry = { start: Date; end: Date };

/** The `{ from, to }` shape react-day-picker uses on web; inlined so this
 *  file stays dependency-free. */
export type DateRangeInput = {
  from?: Date | null;
  to?: Date | null;
};

// Organizers must give attendees enough notice — events can't be posted to
// start (or end) less than 5 hours from the moment they submit.
const BUFFER_MS = 5 * 60 * 60 * 1000;

export function getBufferedNow(): Date {
  return new Date(Date.now() + BUFFER_MS);
}

export type DateValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateSingleDateRange(
  range: DateRangeInput | undefined,
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
  // rather than a blanket message across the whole list.
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
