import { describe, expect, it } from "vitest";
import {
  getEventSoldOutStatus,
  getEventSpotsLeft,
} from "./getEventSoldOutStatus";

// Capacity and ticket stock are two independent limits. Treating capacity as
// the only one meant an event with capacity 100 and 3 tickets kept showing
// "Buy tickets" and "100 spots left" after all 3 were reserved -- buyers only
// hit the wall at create_ticket_checkout. Both now count.

describe("getEventSoldOutStatus", () => {
  it("is sold out once attendance reaches capacity", () => {
    expect(getEventSoldOutStatus({ capacity: 10, attendeeCount: 10 })).toBe(
      true,
    );
  });

  it("is not sold out below capacity with no ticket data", () => {
    expect(getEventSoldOutStatus({ capacity: 10, attendeeCount: 3 })).toBe(
      false,
    );
  });

  it("is sold out when stock is gone even though capacity has room", () => {
    // The regression this function existed to miss.
    expect(
      getEventSoldOutStatus({
        capacity: 100,
        attendeeCount: 0,
        ticketTypes: [{ quantity: 0 }],
      }),
    ).toBe(true);
  });

  it("is not sold out while any tier still has stock", () => {
    expect(
      getEventSoldOutStatus({
        capacity: 100,
        attendeeCount: 0,
        ticketTypes: [{ quantity: 0 }, { quantity: 2 }],
      }),
    ).toBe(false);
  });

  it("treats an unlimited tier as never sold out", () => {
    expect(
      getEventSoldOutStatus({
        capacity: 100,
        attendeeCount: 0,
        ticketTypes: [{ quantity: null }],
      }),
    ).toBe(false);
  });

  it("ignores rows that carry no quantity at all", () => {
    // Discovery RPCs return price/currency only; absent stock data must not
    // be read as zero stock.
    expect(
      getEventSoldOutStatus({
        capacity: 100,
        attendeeCount: 0,
        ticketTypes: [{}],
      }),
    ).toBe(false);
  });

  it("uses capacity alone for an event with no ticket types", () => {
    expect(
      getEventSoldOutStatus({
        capacity: 5,
        attendeeCount: 5,
        ticketTypes: [],
      }),
    ).toBe(true);
  });
});

describe("getEventSpotsLeft", () => {
  it("returns null when neither limit applies", () => {
    expect(getEventSpotsLeft({ capacity: null, attendeeCount: 0 })).toBeNull();
  });

  it("falls back to capacity when stock is unknown", () => {
    expect(getEventSpotsLeft({ capacity: 100, attendeeCount: 8 })).toBe(92);
  });

  it("reports the smaller of capacity room and remaining stock", () => {
    // capacity 100 - 0 attending = 100, but only 3 tickets exist.
    expect(
      getEventSpotsLeft({
        capacity: 100,
        attendeeCount: 0,
        ticketTypes: [{ quantity: 3 }],
      }),
    ).toBe(3);
  });

  it("sums stock across tiers", () => {
    expect(
      getEventSpotsLeft({
        capacity: 100,
        attendeeCount: 0,
        ticketTypes: [{ quantity: 3 }, { quantity: 4 }],
      }),
    ).toBe(7);
  });

  it("reports zero once stock is exhausted", () => {
    expect(
      getEventSpotsLeft({
        capacity: 100,
        attendeeCount: 0,
        ticketTypes: [{ quantity: 0 }],
      }),
    ).toBe(0);
  });

  it("still honours capacity when it is the tighter limit", () => {
    expect(
      getEventSpotsLeft({
        capacity: 2,
        attendeeCount: 0,
        ticketTypes: [{ quantity: 50 }],
      }),
    ).toBe(2);
  });

  it("uses stock alone for an uncapped event", () => {
    expect(
      getEventSpotsLeft({
        capacity: null,
        attendeeCount: 0,
        ticketTypes: [{ quantity: 6 }],
      }),
    ).toBe(6);
  });

  it("treats a mixed unlimited tier as no stock limit", () => {
    expect(
      getEventSpotsLeft({
        capacity: 100,
        attendeeCount: 10,
        ticketTypes: [{ quantity: 3 }, { quantity: null }],
      }),
    ).toBe(90);
  });

  it("never reports a negative number", () => {
    expect(getEventSpotsLeft({ capacity: 5, attendeeCount: 9 })).toBe(0);
  });
});
