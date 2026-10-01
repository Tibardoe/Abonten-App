// Shared event date/time validation — used by the web create/edit event
// forms and the native event-creation wizard, so the "how much notice must
// an organizer give" rule and the range checks can never drift between
// platforms. Framework-free (no react-day-picker import — the range shape
// is inlined).

import type { CoreTranslator } from "./i18n/translator";

export type DateEntry = { start: Date; end: Date };

/** The `{ from, to }` shape react-day-picker uses on web; inlined so this
 *  file stays dependency-free. */
export type DateRangeInput = {
  from?: Date | null;
  to?: Date | null;
};

// Organizers must give attendees enough notice — events can't be posted to
// start (or end) less than 5 hours from the moment they submit.
export const EVENT_NOTICE_HOURS = 5;
const BUFFER_MS = EVENT_NOTICE_HOURS * 60 * 60 * 1000;

export function getBufferedNow(): Date {
  return new Date(Date.now() + BUFFER_MS);
}

export type DateValidationResult =
  | { ok: true }
  | { ok: false; message: string };

// The words live under `eventDates.*` of the core namespace.
export function validateSingleDateRange(
  t: CoreTranslator,
  range: DateRangeInput | undefined,
  bufferedNow: Date = getBufferedNow(),
): DateValidationResult {
  const start = range?.from ? new Date(range.from) : undefined;
  const end = range?.to ? new Date(range.to) : undefined;

  if (!start || !end) {
    return { ok: false, message: t("eventDates.selectBoth") };
  }
  if (start <= bufferedNow || end <= bufferedNow) {
    return {
      ok: false,
      message: t("eventDates.notice", { hours: EVENT_NOTICE_HOURS }),
    };
  }
  if (start >= end) {
    return { ok: false, message: t("eventDates.startBeforeEnd") };
  }

  return { ok: true };
}

export function validateSpecificDates(
  t: CoreTranslator,
  entries: DateEntry[] | undefined,
  bufferedNow: Date = getBufferedNow(),
): DateValidationResult {
  if (!entries || entries.length === 0) {
    return { ok: false, message: t("eventDates.selectOne") };
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
          ? t("eventDates.oneNotice", { hours: EVENT_NOTICE_HOURS })
          : t("eventDates.nthNotice", {
              n: invalidIndex + 1,
              hours: EVENT_NOTICE_HOURS,
            }),
    };
  }

  // Same start-before-end rule validateSingleDateRange applies. Without it
  // an inverted occurrence reached the `occurrence_time_check` CHECK
  // constraint (ends_at > starts_at) and surfaced as a generic
  // "Something went wrong!" with nothing pointing at the date that caused
  // it — the organizer had no way to know which entry to fix.
  const invertedIndex = entries.findIndex(
    (entry) => new Date(entry.start) >= new Date(entry.end),
  );
  if (invertedIndex !== -1) {
    return {
      ok: false,
      message:
        entries.length === 1
          ? t("eventDates.startBeforeEnd")
          : t("eventDates.nthStartBeforeEnd", { n: invertedIndex + 1 }),
    };
  }

  return { ok: true };
}
