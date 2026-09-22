import { describe, expect, it } from "vitest";
import {
  planTicketCapacity,
  ticketCapacityHint,
  ticketCapacityProblem,
} from "./ticketCapacity";

const tiers = (...quantities: (number | null)[]) =>
  quantities.map((quantity) => ({ quantity }));

describe("ticketCapacityProblem — the capacity / quantity matrix", () => {
  it.each<[number | null, (number | null)[], boolean]>([
    // capacity, quantities, valid?
    [null, [null, null], true],
    [null, [100, 50], true],
    [100, [null, null], true],
    [100, [60, null], true],
    [100, [null, 60], true],
    [100, [60, 40], true],
    [100, [60, 50], false],
    [100, [100, null], true],
    [100, [101, null], false],
    [100, [50, 30, 20], true],
    [100, [50, 40, 20], false],
    [100, [], true],
  ])("capacity %s with quantities %j → valid: %s", (capacity, qs, valid) => {
    const problem = ticketCapacityProblem(capacity, tiers(...qs));
    expect(problem === null).toBe(valid);
  });

  it("names both numbers so the organizer knows what to change", () => {
    expect(ticketCapacityProblem(100, tiers(80, 30))).toBe(
      "Ticket quantities total 110, which exceeds the event capacity of 100.",
    );
  });

  it("treats undefined, null and a non-finite capacity as no limit", () => {
    expect(ticketCapacityProblem(undefined, tiers(500))).toBeNull();
    expect(ticketCapacityProblem(Number.NaN, tiers(500))).toBeNull();
    expect(ticketCapacityProblem(0, tiers(500))).toBeNull();
  });

  it("ignores undefined quantities the same way as null ones", () => {
    expect(ticketCapacityProblem(100, [{}, { quantity: 100 }])).toBeNull();
  });
});

describe("planTicketCapacity — the shared pool", () => {
  it("shares the whole capacity when nothing is set", () => {
    expect(planTicketCapacity(100, tiers(null, null, null))).toEqual({
      capacity: 100,
      reserved: 0,
      sharedTypeCount: 3,
      sharedPool: 100,
    });
  });

  it("reserves the set quantities and leaves the rest to the unset types", () => {
    expect(planTicketCapacity(100, tiers(50, 30, null))).toEqual({
      capacity: 100,
      reserved: 80,
      sharedTypeCount: 1,
      sharedPool: 20,
    });
  });

  it("has no pool without a capacity", () => {
    expect(planTicketCapacity(null, tiers(50, null)).sharedPool).toBeNull();
  });

  it("goes negative when the set quantities already exceed the capacity", () => {
    expect(planTicketCapacity(100, tiers(80, 30)).sharedPool).toBe(-10);
  });
});

describe("ticketCapacityHint", () => {
  it("says nothing without a capacity or without ticket types", () => {
    expect(ticketCapacityHint(null, tiers(10))).toBeNull();
    expect(ticketCapacityHint(100, [])).toBeNull();
  });

  it("explains a fully shared capacity", () => {
    expect(ticketCapacityHint(100, tiers(null, null))).toBe(
      "All 100 seats are shared across your ticket types.",
    );
  });

  it("explains the split between reserved and shared seats", () => {
    expect(ticketCapacityHint(100, tiers(60, null))).toBe(
      "60 seats reserved by the quantities you set; the remaining 40 seats are shared by the type without a quantity.",
    );
  });

  it("points out seats no ticket type can sell", () => {
    expect(ticketCapacityHint(100, tiers(60, 30))).toBe(
      "Ticket quantities use 90 of 100 seats; 10 will stay unsold unless you raise a quantity.",
    );
    expect(ticketCapacityHint(100, tiers(60, 40))).toBe(
      "Ticket quantities use all 100 seats.",
    );
  });

  it("leaves an over-allocation to the problem message", () => {
    expect(ticketCapacityHint(100, tiers(60, 50))).toBeNull();
  });
});
