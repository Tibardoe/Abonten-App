import { describe, expect, it } from "vitest";
import { windowBoundsInZone } from "../eventDateWindow";
import { getDashboardPeriodRange } from "../organizerDashboardDateRange";
import { getTransactionPeriodRange } from "../transactionsDateRange";
import {
  addCalendarDays,
  calendarDayOf,
  startOfCalendarDay,
  startOfDayInZone,
  startOfMonthInZone,
} from "./timeZone";

const iso = (d: Date | null) => d?.toISOString();

describe("calendar boundaries in a zone", () => {
  it("starts the day at local midnight", () => {
    // 03:00 UTC on the 26th is still the 25th in New York (UTC-4 in summer).
    const at = new Date("2026-09-26T03:00:00Z");
    expect(iso(startOfDayInZone(at, "America/New_York"))).toBe(
      "2026-09-25T04:00:00.000Z",
    );
    expect(iso(startOfDayInZone(at, "Africa/Lagos"))).toBe(
      "2026-09-25T23:00:00.000Z",
    );
  });

  it("gives Ghana exactly the UTC answer it always had", () => {
    const at = new Date("2026-09-26T15:30:00Z");
    expect(iso(startOfDayInZone(at, "Africa/Accra"))).toBe(
      "2026-09-26T00:00:00.000Z",
    );
    expect(iso(startOfMonthInZone(at, "Africa/Accra", -1))).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("finds month starts across a year boundary", () => {
    const at = new Date("2026-01-15T12:00:00Z");
    expect(iso(startOfMonthInZone(at, "Africa/Lagos", -1))).toBe(
      "2025-11-30T23:00:00.000Z",
    );
    // 02:00 UTC on 1 October is still September in Los Angeles.
    expect(
      iso(
        startOfMonthInZone(
          new Date("2026-10-01T02:00:00Z"),
          "America/Los_Angeles",
        ),
      ),
    ).toBe("2026-09-01T07:00:00.000Z");
  });

  it("falls back to UTC for an unknown zone", () => {
    const at = new Date("2026-09-26T15:30:00Z");
    expect(iso(startOfDayInZone(at, "Not/AZone"))).toBe(
      "2026-09-26T00:00:00.000Z",
    );
  });

  it("does calendar arithmetic without a zone", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(iso(startOfCalendarDay("2026-10-01", "Europe/London"))).toBe(
      "2026-09-30T23:00:00.000Z",
    );
  });

  it("reads the calendar day a value names", () => {
    expect(calendarDayOf("2026-09-30", "Africa/Lagos")).toBe("2026-09-30");
    expect(calendarDayOf("2026-09-30 00:00:00", "Africa/Lagos")).toBe(
      "2026-09-30",
    );
    // A Lagos browser's midnight on the 30th, sent as an instant.
    expect(calendarDayOf("2026-09-29T23:00:00.000Z", "Africa/Lagos")).toBe(
      "2026-09-30",
    );
    expect(
      calendarDayOf(new Date("2026-09-30T00:00:00Z"), "Africa/Accra"),
    ).toBe("2026-09-30");
    expect(calendarDayOf("nonsense", "Africa/Accra")).toBeNull();
    expect(calendarDayOf(null, "Africa/Accra")).toBeNull();
  });
});

describe("period ranges follow the viewer's zone", () => {
  it("dashboard 'today' across the UK clock change", () => {
    // Clocks go back at 01:00 UTC on 25 October 2026.
    const r = getDashboardPeriodRange(
      "today",
      new Date("2026-10-25T12:00:00Z"),
      "Europe/London",
    );
    expect(iso(r.start)).toBe("2026-10-24T23:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-10-23T23:00:00.000Z");
  });

  it("dashboard defaults to UTC", () => {
    const r = getDashboardPeriodRange(
      "today",
      new Date("2026-09-26T15:00:00Z"),
    );
    expect(iso(r.start)).toBe("2026-09-26T00:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-09-25T00:00:00.000Z");
  });

  it("transactions 'last month' in Lagos", () => {
    const r = getTransactionPeriodRange(
      "lastMonth",
      new Date("2026-09-26T15:00:00Z"),
      "Africa/Lagos",
    );
    expect(iso(r.start)).toBe("2026-07-31T23:00:00.000Z");
    expect(iso(r.end)).toBe("2026-08-31T22:59:59.999Z");
  });
});

describe("'Happening today / this month' on the visitor's calendar", () => {
  it("rolls over at local midnight, not UTC's", () => {
    // 23:30 UTC on the 26th is already the 27th in Lagos.
    const b = windowBoundsInZone(
      new Date("2026-09-26T23:30:00Z"),
      "Africa/Lagos",
    );
    expect(iso(b.todayStart)).toBe("2026-09-26T23:00:00.000Z");
    expect(iso(b.todayEnd)).toBe("2026-09-27T22:59:59.999Z");
    expect(iso(b.endOfMonth)).toBe("2026-09-30T22:59:59.999Z");
  });
});
