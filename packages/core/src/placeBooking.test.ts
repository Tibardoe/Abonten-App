import { describe, expect, it } from "vitest";
import { isBookingLapsed, resolveBookingState } from "./placeBooking";

const NOW = new Date("2026-09-14T12:00:00Z");
const PAST = "2026-09-07T10:00:00Z";
const FUTURE = "2026-09-20T10:00:00Z";

describe("isBookingLapsed", () => {
  it("lapses a pending request whose time has passed", () => {
    expect(isBookingLapsed("pending", PAST, NOW)).toBe(true);
  });

  it("leaves a pending request in the future alone", () => {
    expect(isBookingLapsed("pending", FUTURE, NOW)).toBe(false);
  });

  // An accepted booking in the past happened — it did not lapse, and both
  // sides should keep seeing it as accepted.
  it("never lapses a booking that was answered", () => {
    expect(isBookingLapsed("accepted", PAST, NOW)).toBe(false);
    expect(isBookingLapsed("declined", PAST, NOW)).toBe(false);
    expect(isBookingLapsed("cancelled", PAST, NOW)).toBe(false);
  });

  it("treats a missing or unparseable time as not lapsed", () => {
    expect(isBookingLapsed("pending", null, NOW)).toBe(false);
    expect(isBookingLapsed("pending", undefined, NOW)).toBe(false);
    expect(isBookingLapsed("pending", "not a date", NOW)).toBe(false);
  });

  it("accepts a Date as well as a string", () => {
    expect(isBookingLapsed("pending", new Date(PAST), NOW)).toBe(true);
  });

  it("does not lapse a request at the exact moment it is due", () => {
    expect(isBookingLapsed("pending", NOW.toISOString(), NOW)).toBe(false);
  });
});

describe("resolveBookingState", () => {
  it("reports lapsed only for an unanswered past request", () => {
    expect(resolveBookingState("pending", PAST, NOW)).toBe("lapsed");
    expect(resolveBookingState("pending", FUTURE, NOW)).toBe("pending");
    expect(resolveBookingState("accepted", PAST, NOW)).toBe("accepted");
    expect(resolveBookingState("cancelled", FUTURE, NOW)).toBe("cancelled");
  });
});
