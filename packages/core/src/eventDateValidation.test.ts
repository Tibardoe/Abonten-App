import { describe, expect, it } from "vitest";
import {
  validateSingleDateRange,
  validateSpecificDates,
} from "./eventDateValidation";

// A fixed "now" so the 5-hour notice rule is deterministic. Every date below
// is far enough ahead of it that only the rule under test can fail.
const NOW = new Date("2026-01-01T00:00:00.000Z");
const day = (iso: string) => new Date(iso);

describe("validateSingleDateRange", () => {
  it("accepts a start strictly before the end", () => {
    expect(
      validateSingleDateRange(
        { from: day("2026-02-01T18:00:00Z"), to: day("2026-02-01T22:00:00Z") },
        NOW,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects an end earlier than the start", () => {
    expect(
      validateSingleDateRange(
        { from: day("2026-02-01T18:00:00Z"), to: day("2026-02-01T17:00:00Z") },
        NOW,
      ),
    ).toEqual({
      ok: false,
      message: "Start time must be earlier than end time",
    });
  });

  it("rejects a zero-length range", () => {
    const at = day("2026-02-01T18:00:00Z");
    expect(validateSingleDateRange({ from: at, to: at }, NOW).ok).toBe(false);
  });
});

describe("validateSpecificDates", () => {
  it("accepts occurrences that each start before they end", () => {
    expect(
      validateSpecificDates(
        [
          {
            start: day("2026-02-01T18:00:00Z"),
            end: day("2026-02-01T22:00:00Z"),
          },
          {
            start: day("2026-02-08T18:00:00Z"),
            end: day("2026-02-08T22:00:00Z"),
          },
        ],
        NOW,
      ),
    ).toEqual({ ok: true });
  });

  // Regression: an inverted occurrence used to pass every app-side check and
  // only fail on the `occurrence_time_check` CHECK constraint, which the
  // organizer saw as a bare "Something went wrong!".
  it("rejects an occurrence whose end is before its start, naming it", () => {
    expect(
      validateSpecificDates(
        [
          {
            start: day("2026-02-01T18:00:00Z"),
            end: day("2026-02-01T22:00:00Z"),
          },
          {
            start: day("2026-02-08T22:00:00Z"),
            end: day("2026-02-08T18:00:00Z"),
          },
        ],
        NOW,
      ),
    ).toEqual({
      ok: false,
      message: "Date 2: start time must be earlier than end time",
    });
  });

  it("uses the unnumbered message when there is only one date", () => {
    expect(
      validateSpecificDates(
        [
          {
            start: day("2026-02-01T22:00:00Z"),
            end: day("2026-02-01T18:00:00Z"),
          },
        ],
        NOW,
      ),
    ).toEqual({
      ok: false,
      message: "Start time must be earlier than end time",
    });
  });

  // Both rules are broken here (the date is in the past AND inverted). The
  // notice-period message wins so the organizer is told the blocking problem
  // first rather than being sent to fix the times on a date they cannot use.
  it("reports the notice-period failure before the ordering one", () => {
    expect(
      validateSpecificDates(
        [
          {
            start: day("2025-12-31T22:00:00Z"),
            end: day("2025-12-31T18:00:00Z"),
          },
        ],
        NOW,
      ),
    ).toEqual({
      ok: false,
      message: "The selected date must be at least 5 hours from now",
    });
  });
});
