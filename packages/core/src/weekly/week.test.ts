import { describe, expect, it } from "vitest";
import {
  accraToday,
  addDays,
  defaultScheduleFor,
  formatWeekRange,
  fromAccraInputValue,
  isIsoDate,
  isWeekOver,
  isWeekStart,
  nextWeekStart,
  toAccraInputValue,
  weekEndFor,
  weekStartFor,
  weekWindow,
} from "./week";

describe("weekStartFor", () => {
  it("returns the Monday for every day of the week", () => {
    // 2026-09-14 is a Monday.
    for (const day of [
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]) {
      expect(weekStartFor(day)).toBe("2026-09-14");
    }
    expect(weekStartFor("2026-09-21")).toBe("2026-09-21");
  });

  it("treats Sunday as the last day of the week, not the first", () => {
    expect(weekStartFor("2026-09-13")).toBe("2026-09-07");
  });

  it("crosses month and year boundaries", () => {
    expect(weekStartFor("2026-10-01")).toBe("2026-09-28");
    expect(weekStartFor("2027-01-01")).toBe("2026-12-28");
    expect(weekStartFor("2028-02-29")).toBe("2028-02-28");
  });

  it("uses the Accra (UTC) calendar day of an instant", () => {
    // 23:30 on Sunday Accra time is still Sunday.
    expect(weekStartFor(new Date("2026-09-20T23:30:00Z"))).toBe("2026-09-14");
    // 00:05 on Monday starts the new week.
    expect(weekStartFor(new Date("2026-09-21T00:05:00Z"))).toBe("2026-09-21");
  });
});

describe("date helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isIsoDate("2026-09-14")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-9-14")).toBe(false);
    expect(isIsoDate("not a date")).toBe(false);
  });

  it("recognises week starts", () => {
    expect(isWeekStart("2026-09-14")).toBe(true);
    expect(isWeekStart("2026-09-15")).toBe(false);
    expect(isWeekStart("2026-02-30")).toBe(false);
  });

  it("adds days and finds the week end", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(weekEndFor("2026-09-14")).toBe("2026-09-20");
    expect(nextWeekStart(new Date("2026-09-16T12:00:00Z"))).toBe("2026-09-21");
    expect(accraToday(new Date("2026-09-16T23:59:00Z"))).toBe("2026-09-16");
  });

  it("knows when a week is over", () => {
    expect(isWeekOver("2026-09-14", new Date("2026-09-20T23:59:59Z"))).toBe(
      false,
    );
    expect(isWeekOver("2026-09-14", new Date("2026-09-21T00:00:00Z"))).toBe(
      true,
    );
  });

  it("spans the full week", () => {
    expect(weekWindow("2026-09-14")).toEqual({
      start: "2026-09-14T00:00:00.000Z",
      end: "2026-09-20T23:59:59.999Z",
    });
  });
});

describe("formatWeekRange", () => {
  it("formats a week inside one month", () => {
    expect(formatWeekRange("2026-09-14")).toBe("14–20 September 2026");
  });

  it("formats a week across two months", () => {
    expect(formatWeekRange("2026-09-28")).toBe("28 September – 4 October 2026");
  });

  it("formats a week across two years", () => {
    expect(formatWeekRange("2026-12-28")).toBe(
      "28 December 2026 – 3 January 2027",
    );
  });
});

describe("scheduling inputs", () => {
  it("defaults to the given Accra hour on the Monday", () => {
    expect(defaultScheduleFor("2026-09-14", 6)).toBe(
      "2026-09-14T06:00:00.000Z",
    );
    expect(defaultScheduleFor("2026-09-14", 99)).toBe(
      "2026-09-14T23:00:00.000Z",
    );
  });

  it("round-trips datetime-local values in Accra time", () => {
    const iso = "2026-09-14T06:30:00.000Z";
    expect(toAccraInputValue(iso)).toBe("2026-09-14T06:30");
    expect(fromAccraInputValue("2026-09-14T06:30")).toBe(iso);
    expect(fromAccraInputValue("tomorrow")).toBeNull();
  });
});
