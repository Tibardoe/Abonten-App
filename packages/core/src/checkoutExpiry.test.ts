import { describe, expect, it } from "vitest";
import {
  CHECKOUT_RESERVATION_MINUTES,
  getCheckoutExpiryTimestamp,
} from "./checkoutExpiry";

describe("getCheckoutExpiryTimestamp", () => {
  it("returns a timestamp CHECKOUT_RESERVATION_MINUTES in the future", () => {
    const before = Date.now();
    const expiry = getCheckoutExpiryTimestamp();
    const after = Date.now();

    const expectedMin = before + CHECKOUT_RESERVATION_MINUTES * 60 * 1000;
    const expectedMax = after + CHECKOUT_RESERVATION_MINUTES * 60 * 1000;

    expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(expiry.getTime()).toBeLessThanOrEqual(expectedMax);
  });
});
