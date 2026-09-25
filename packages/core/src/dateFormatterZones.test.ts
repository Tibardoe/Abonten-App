import { describe, expect, it } from "vitest";
import {
  formatFullDateTimeRange,
  getEventCardDateTime,
  wallClockParts,
  zoneHint,
} from "./dateFormatter";
import { formatMoney } from "./formatMoney";
import {
  describePriceParam,
  isAnyPriceParam,
  parseFilters,
  priceParam,
} from "./parseFilterModalQueries";

// 2026-10-03T18:30:00Z is 19:30 in Lagos (WAT, UTC+1), 18:30 in Accra (UTC+0).
const AT = "2026-10-03T18:30:00Z";

describe("event times on the venue's clock", () => {
  it("reads the wall clock in the event's zone", () => {
    expect(wallClockParts(AT, "Africa/Lagos")).toMatchObject({
      hours: 19,
      minutes: 30,
      day: 3,
    });
    expect(wallClockParts(AT, "Africa/Accra")).toMatchObject({
      hours: 18,
      minutes: 30,
    });
  });

  it("formats a card and a range in that zone", () => {
    const card = getEventCardDateTime(
      AT,
      "2026-10-03T21:00:00Z",
      null,
      "Africa/Lagos",
    );
    expect(card.time.startsWith("7:30 PM")).toBe(true);
    const range = formatFullDateTimeRange(
      AT,
      "2026-10-03T21:00:00Z",
      "Africa/Lagos",
    );
    expect(range.time.startsWith("07:30 PM - 10:00 PM")).toBe(true);
    expect(range.date).toBe("Sat, 3rd Oct 2026");
  });

  it("adds a zone hint only when the viewer keeps a different clock", () => {
    // October: London is on BST (UTC+1), the same clock as Lagos.
    expect(zoneHint(AT, "Africa/Lagos", "Europe/London")).toBe("");
    expect(zoneHint(AT, "Africa/Lagos", "Africa/Accra")).not.toBe("");
    expect(zoneHint(AT, "Africa/Accra", "Africa/Accra")).toBe("");
    expect(zoneHint(AT, null, "Africa/Accra")).toBe("");
    expect(zoneHint(AT, "Not/AZone", "Africa/Accra")).toBe("");
  });
});

describe("legacy major-unit formatter", () => {
  it("uses the currency's own sign and never throws on a missing code", () => {
    expect(formatMoney("GHS", 25.2)).toBe("GH₵25.20");
    expect(formatMoney("NGN", 25000)).toBe("₦25,000.00");
    expect(formatMoney("", 12)).toBe("12.00");
    expect(formatMoney(null, "3.5")).toBe("3.50");
  });
});

describe("currency-neutral price filter", () => {
  it("writes and reads 0-250, and still reads old GHS links", () => {
    expect(priceParam(0, 250)).toBe("0-250");
    expect(parseFilters({ price: "0-250" })).toMatchObject({
      minPrice: 0,
      maxPrice: 250,
    });
    expect(parseFilters({ price: "GHS 0 - GHS 250" })).toMatchObject({
      minPrice: 0,
      maxPrice: 250,
    });
    expect(isAnyPriceParam("0-999")).toBe(true);
    expect(isAnyPriceParam(undefined)).toBe(true);
    expect(describePriceParam("20-250", "NGN")).toBe("₦20 – ₦250");
    expect(describePriceParam("0-999", "NGN")).toBeNull();
  });
});
