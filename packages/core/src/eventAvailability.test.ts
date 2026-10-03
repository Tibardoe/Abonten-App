import { describe, expect, it } from "vitest";
import {
  readTicketTiers,
  withInlineEventAvailability,
} from "./eventAvailability";
import {
  getEventSoldOutStatus,
  getEventSpotsLeft,
} from "./getEventSoldOutStatus";

describe("readTicketTiers", () => {
  it("reads the tiers a list row carries", () => {
    expect(
      readTicketTiers([
        { price: 0, currency: "GHS", quantity: 12 },
        { price: "150.00", currency: "GHS", quantity: null },
      ]),
    ).toEqual([
      { price: 0, currency: "GHS", quantity: 12 },
      { price: 150, currency: "GHS", quantity: null },
    ]);
  });

  it("is undefined when the row has no tier list, and empty when it has none", () => {
    expect(readTicketTiers(null)).toBeUndefined();
    expect(readTicketTiers(undefined)).toBeUndefined();
    expect(readTicketTiers("x")).toBeUndefined();
    expect(readTicketTiers([])).toEqual([]);
  });
});

describe("withInlineEventAvailability", () => {
  it("turns the row's names into the card's", () => {
    const row = withInlineEventAvailability({
      id: "e1",
      capacity: 100,
      attendance_count: "3",
      ticket_types: [{ price: 20, currency: "GHS", quantity: 0 }],
    });
    expect(row.attendanceCount).toBe(3);
    expect(row.ticket_type).toEqual([
      { price: 20, currency: "GHS", quantity: 0 },
    ]);
    // Every ticket is gone although the venue has room: sold out, and no
    // "97 spots left".
    expect(
      getEventSoldOutStatus({
        capacity: row.capacity,
        attendeeCount: row.attendanceCount,
        ticketTypes: row.ticket_type,
      }),
    ).toBe(true);
    expect(
      getEventSpotsLeft({
        capacity: row.capacity,
        attendeeCount: row.attendanceCount,
        ticketTypes: row.ticket_type,
      }),
    ).toBe(0);
  });

  it("keeps the tiers a detail read already has", () => {
    const row = withInlineEventAvailability({
      attendance_count: 1,
      ticket_type: [{ price: 5, currency: "GHS", quantity: 9 }],
      ticket_types: [{ price: 5, currency: "GHS", quantity: 1 }],
    });
    expect(row.ticket_type?.[0].quantity).toBe(9);
  });

  it("counts nobody and knows no tiers when the row carries neither", () => {
    const row = withInlineEventAvailability({
      id: "e2",
      attendance_count: null,
    });
    expect(row.attendanceCount).toBe(0);
    expect(row.ticket_type).toBeUndefined();
  });
});
