import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatPercent,
} from "./format";

// The separators differ by language and some are non-breaking spaces:
// compare after folding every kind of space to a plain one.
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("formatPercent", () => {
  it("writes the sign where the reader's language puts it", () => {
    expect(formatPercent(7, "en")).toBe("7%");
    expect(plain(formatPercent(7, "fr"))).toBe("7 %");
    expect(plain(formatPercent(7, "de"))).toBe("7 %");
    expect(plain(formatPercent(7, "es"))).toBe("7 %");
    expect(formatPercent(7, "pt")).toBe("7%");
  });

  it("takes the percentage itself, not a ratio", () => {
    expect(formatPercent(100, "en")).toBe("100%");
    expect(formatPercent(0.5, "en", { maximumFractionDigits: 1 })).toBe("0.5%");
  });

  it("shows decimals only as far as it is asked to", () => {
    expect(formatPercent(7.25, "en")).toBe("7%");
    expect(formatPercent(7.25, "en", { maximumFractionDigits: 2 })).toBe(
      "7.25%",
    );
    expect(formatPercent(7.5, "en", { maximumFractionDigits: 2 })).toBe("7.5%");
    expect(plain(formatPercent(12.5, "fr", { minimumFractionDigits: 1 }))).toBe(
      "12,5 %",
    );
    expect(formatPercent(12, "en", { minimumFractionDigits: 1 })).toBe("12.0%");
  });

  it("marks a rise and a fall when asked to", () => {
    const options = {
      minimumFractionDigits: 1,
      signDisplay: "exceptZero",
    } as const;
    expect(formatPercent(12.5, "en", options)).toBe("+12.5%");
    expect(formatPercent(-5, "en", options)).toBe("-5.0%");
    expect(formatPercent(0, "en", options)).toBe("0.0%");
  });

  it("never prints NaN", () => {
    expect(formatPercent(null, "en")).toBe("0%");
    expect(formatPercent("not a number", "en")).toBe("0%");
    expect(formatPercent("40", "en")).toBe("40%");
  });
});

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
