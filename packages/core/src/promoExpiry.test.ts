import { describe, expect, it } from "vitest";
import { promoExpiryCutoff, promoExpiryForStorage } from "./promoExpiry";

describe("promo-code expiry in the event's calendar", () => {
  it("keeps Ghana's answer: the day ends at UTC midnight", () => {
    expect(
      promoExpiryCutoff("2026-09-30T00:00:00", "Africa/Accra").toISOString(),
    ).toBe("2026-10-01T00:00:00.000Z");
  });

  it("ends the last day at midnight where the event is", () => {
    // Lagos is UTC+1: its 1 October starts at 23:00 UTC on 30 September.
    expect(
      promoExpiryCutoff("2026-09-30 00:00:00", "Africa/Lagos").toISOString(),
    ).toBe("2026-09-30T23:00:00.000Z");
    // Nairobi is UTC+3.
    expect(
      promoExpiryCutoff("2026-09-30T00:00:00", "Africa/Nairobi").toISOString(),
    ).toBe("2026-09-30T21:00:00.000Z");
  });

  it("stores the day the organizer picked, read in the event's zone", () => {
    // A Lagos browser's midnight on the 30th arrives as 23:00 UTC on the 29th.
    expect(
      promoExpiryForStorage("2026-09-29T23:00:00.000Z", "Africa/Lagos"),
    ).toBe("2026-09-30T00:00:00");
    expect(
      promoExpiryForStorage(new Date("2026-09-30T00:00:00Z"), "Africa/Accra"),
    ).toBe("2026-09-30T00:00:00");
    expect(promoExpiryForStorage("2026-09-30", "Europe/London")).toBe(
      "2026-09-30T00:00:00",
    );
    expect(promoExpiryForStorage(null, "Africa/Accra")).toBeNull();
    expect(promoExpiryForStorage("soon", "Africa/Accra")).toBeNull();
  });
});
