import { describe, expect, it } from "vitest";
import { nextReminderStart } from "./reminderStart";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const iso = (offsetHours: number) =>
  new Date(NOW + offsetHours * HOUR).toISOString();

describe("nextReminderStart", () => {
  it("offers a single-date event that has not started, as given", () => {
    const start = "2026-11-24T18:00:00+00:00";
    expect(nextReminderStart(start, null, { now: NOW })).toBe(start);
    expect(nextReminderStart(start, [], { now: NOW })).toBe(start);
  });

  it("offers nothing once a single-date event is on (or over)", () => {
    // On now: started an hour ago (same-day sales may still be selling).
    expect(nextReminderStart(iso(-1), null, { now: NOW })).toBeNull();
    // Exactly at the start counts as started.
    expect(nextReminderStart(iso(0), null, { now: NOW })).toBeNull();
    expect(nextReminderStart(iso(-48), null, { now: NOW })).toBeNull();
    expect(nextReminderStart(null, null, { now: NOW })).toBeNull();
  });

  it("offers the next date of an event with several, while one is on", () => {
    const dates = [
      { starts_at: iso(48) },
      { starts_at: iso(-2) }, // on now
      { starts_at: iso(24) },
    ];
    expect(nextReminderStart(null, dates, { now: NOW })).toBe(iso(24));
  });

  it("offers nothing when the only remaining date is on now", () => {
    const dates = [{ starts_at: iso(-30) }, { starts_at: iso(-2) }];
    expect(nextReminderStart(null, dates, { now: NOW })).toBeNull();
  });

  it("reads the dates, not the event's own start, when it has several", () => {
    expect(
      nextReminderStart(iso(5), [{ starts_at: iso(-1) }], { now: NOW }),
    ).toBeNull();
    expect(
      nextReminderStart(iso(-5), [{ starts_at: iso(3) }], { now: NOW }),
    ).toBe(iso(3));
  });

  it("offers nothing for a postponed event", () => {
    expect(
      nextReminderStart(iso(24), null, {
        now: NOW,
        postponedAt: "2026-11-20T09:00:00Z",
      }),
    ).toBeNull();
  });

  it("accepts dates and skips unreadable ones", () => {
    expect(
      nextReminderStart(
        null,
        [{ starts_at: "not a date" }, { starts_at: new Date(NOW + 2 * HOUR) }],
        {
          now: NOW,
        },
      ),
    ).toBe(iso(2));
  });
});
