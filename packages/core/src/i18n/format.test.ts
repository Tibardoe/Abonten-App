import { describe, expect, it } from "vitest";
import { formatCount, formatDate, formatDateTime } from "./format";

// The separators differ by language and some are non-breaking spaces:
// compare after folding every kind of space to a plain one.
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("formatCount", () => {
  it("groups the way the reader's language does", () => {
    expect(formatCount(12345, "en")).toBe("12,345");
    expect(plain(formatCount(12345, "fr"))).toBe("12 345");
    expect(formatCount(12345, "de")).toBe("12.345");
    expect(formatCount(12345, "es")).toBe("12.345");
  });

  it("follows English conventions for Akan and for no language at all", () => {
    expect(formatCount(12345, "ak")).toBe("12,345");
    expect(formatCount(12345)).toBe("12,345");
    expect(formatCount(12345, null)).toBe("12,345");
  });

  it("never prints NaN", () => {
    expect(formatCount(null, "fr")).toBe("0");
    expect(formatCount(undefined, "fr")).toBe("0");
    expect(formatCount(Number.NaN, "fr")).toBe("0");
    expect(formatCount("42", "fr")).toBe("42");
    expect(formatCount("not a number", "fr")).toBe("0");
  });
});

describe("formatDateTime", () => {
  const moment = "2026-10-03T14:30:00Z";

  it("writes the month in the reader's language", () => {
    const utc = { timeZone: "UTC" } as const;
    const english = formatDateTime(moment, "en", {
      ...utc,
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const french = formatDateTime(moment, "fr", {
      ...utc,
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    expect(english).toBe("3 October 2026");
    expect(french).toBe("3 octobre 2026");
  });

  it("reads the clock it is asked to read", () => {
    const options = {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    } as const;
    expect(
      formatDateTime(moment, "en", { ...options, timeZone: "Africa/Accra" }),
    ).toBe("14:30");
    expect(
      formatDateTime(moment, "en", { ...options, timeZone: "Africa/Lagos" }),
    ).toBe("15:30");
  });

  it("is empty for something that is not a date", () => {
    expect(formatDateTime(null, "fr")).toBe("");
    expect(formatDateTime("", "fr")).toBe("");
    expect(formatDateTime("yesterday-ish", "fr")).toBe("");
    expect(formatDate(undefined, "fr")).toBe("");
  });

  it("gives a day without a time for formatDate", () => {
    expect(
      formatDate(moment, "en", { timeZone: "UTC", dateStyle: "medium" }),
    ).toBe("3 Oct 2026");
  });
});
