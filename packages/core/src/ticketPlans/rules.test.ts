import { describe, expect, it } from "vitest";
import {
  DEFAULT_TICKET_PLAN_RULES,
  checkPartAmount,
  daysUntil,
  dueReminder,
  partBounds,
  planDeadline,
  planMinimums,
  planOfferWindow,
  planProgress,
  suggestedPartAmounts,
  unfinishedRefund,
} from "./rules";

const DAY = 86_400_000;
const rules = DEFAULT_TICKET_PLAN_RULES;

describe("planDeadline / planOfferWindow", () => {
  const starts = new Date("2026-12-20T18:00:00Z");

  it("is the start minus the configured hours", () => {
    expect(planDeadline(starts, rules).toISOString()).toBe(
      "2026-12-18T18:00:00.000Z",
    );
  });

  it("is offered only while the deadline is far enough away", () => {
    const deadline = planDeadline(starts, rules).getTime();
    expect(planOfferWindow(starts, rules, deadline - 3 * DAY).ok).toBe(true);
    expect(planOfferWindow(starts, rules, deadline - 3 * DAY + 1)).toEqual({
      ok: false,
      reason: "too_soon",
    });
  });
});

describe("planMinimums", () => {
  it("rounds each share up to a whole minor unit", () => {
    // GH₵210.00 total: 20% = 42.00, 10% = 21.00
    expect(planMinimums(21_000, rules)).toEqual({
      firstPartMinMinor: 4_200,
      partMinMinor: 2_100,
    });
    // 20% of 1 001 is 200.2 -> 201; 10% is 100.1 -> 101
    expect(planMinimums(1_001, rules)).toEqual({
      firstPartMinMinor: 201,
      partMinMinor: 101,
    });
  });

  it("never asks for more than the total, nor less than one unit", () => {
    expect(planMinimums(3, rules)).toEqual({
      firstPartMinMinor: 1,
      partMinMinor: 1,
    });
    expect(
      planMinimums(500, { firstPartMinBps: 10_000, partMinBps: 10_000 }),
    ).toEqual({ firstPartMinMinor: 500, partMinMinor: 500 });
  });
});

describe("partBounds / checkPartAmount", () => {
  const plan = {
    status: "awaiting_payment" as const,
    totalMinor: 21_000,
    paidMinor: 0,
    firstPartMinMinor: 4_200,
    partMinMinor: 2_100,
  };

  it("asks the first part's minimum while nothing is paid", () => {
    expect(partBounds(plan)).toEqual({ minMinor: 4_200, maxMinor: 21_000 });
    expect(checkPartAmount(plan, 4_199)).toEqual({
      ok: false,
      problem: "below_minimum",
    });
    expect(checkPartAmount(plan, 4_200)).toEqual({ ok: true });
  });

  it("then the smaller minimum, and the last part may be anything left", () => {
    const active = { ...plan, status: "active" as const, paidMinor: 20_000 };
    expect(partBounds(active)).toEqual({ minMinor: 1_000, maxMinor: 1_000 });
    expect(checkPartAmount(active, 1_001)).toEqual({
      ok: false,
      problem: "above_remaining",
    });
    expect(checkPartAmount(active, 1_000)).toEqual({ ok: true });
  });

  it("takes nothing once the plan stops taking payments", () => {
    for (const status of [
      "settling",
      "completed",
      "lapsed",
      "cancelled",
      "expired",
    ] as const) {
      expect(partBounds({ ...plan, status })).toBeNull();
      expect(checkPartAmount({ ...plan, status }, 5_000)).toEqual({
        ok: false,
        problem: "not_payable",
      });
    }
  });

  it("refuses fractions and non-positive amounts", () => {
    expect(checkPartAmount(plan, 4_200.5)).toEqual({
      ok: false,
      problem: "invalid",
    });
    expect(checkPartAmount(plan, 0)).toEqual({
      ok: false,
      problem: "invalid",
    });
  });
});

describe("unfinishedRefund", () => {
  it("returns the ticket share and keeps the fee share", () => {
    // ticket 200.00 + fee 10.00 = 210.00; 105.00 paid -> 100.00 back
    expect(
      unfinishedRefund({
        paidMinor: 10_500,
        ticketMinor: 20_000,
        totalMinor: 21_000,
        keepFeeOnRefund: true,
      }),
    ).toEqual({ refundMinor: 10_000, keptMinor: 500 });
  });

  it("rounds the refund down, the pesewa stays with the fee", () => {
    expect(
      unfinishedRefund({
        paidMinor: 4_201,
        ticketMinor: 20_000,
        totalMinor: 21_000,
        keepFeeOnRefund: true,
      }),
    ).toEqual({ refundMinor: 4_000, keptMinor: 201 });
  });

  it("returns everything when the terms do not keep the fee", () => {
    expect(
      unfinishedRefund({
        paidMinor: 4_201,
        ticketMinor: 20_000,
        totalMinor: 21_000,
        keepFeeOnRefund: false,
      }),
    ).toEqual({ refundMinor: 4_201, keptMinor: 0 });
  });

  it("has nothing to return when nothing was paid", () => {
    expect(
      unfinishedRefund({
        paidMinor: 0,
        ticketMinor: 20_000,
        totalMinor: 21_000,
        keepFeeOnRefund: true,
      }),
    ).toEqual({ refundMinor: 0, keptMinor: 0 });
  });
});

describe("suggestedPartAmounts", () => {
  it("offers the minimum, about half and everything, in whole units", () => {
    expect(
      suggestedPartAmounts({ minMinor: 4_200, maxMinor: 21_000 }, 100),
    ).toEqual([4_200, 10_500, 21_000]);
  });

  it("rounds the minimum up to a whole unit", () => {
    expect(
      suggestedPartAmounts({ minMinor: 2_101, maxMinor: 10_001 }, 100),
    ).toEqual([2_200, 5_100, 10_001]);
  });

  it("collapses to one choice when only one amount is possible", () => {
    expect(
      suggestedPartAmounts({ minMinor: 1_000, maxMinor: 1_000 }, 100),
    ).toEqual([1_000]);
  });
});

describe("dueReminder", () => {
  const deadline = new Date("2026-12-18T18:00:00Z");

  it("sends nothing before the first reminder is due", () => {
    expect(
      dueReminder(deadline, [7, 2], [], deadline.getTime() - 8 * DAY),
    ).toBe(null);
  });

  it("sends the 7-day reminder, then the 2-day one", () => {
    expect(
      dueReminder(deadline, [7, 2], [], deadline.getTime() - 6 * DAY),
    ).toEqual({ send: 7, markSent: [7] });
    expect(
      dueReminder(deadline, [7, 2], [7], deadline.getTime() - DAY),
    ).toEqual({ send: 2, markSent: [2] });
  });

  it("sends only the closest when several were missed", () => {
    expect(dueReminder(deadline, [7, 2], [], deadline.getTime() - DAY)).toEqual(
      { send: 2, markSent: [2, 7] },
    );
  });

  it("sends nothing once the deadline has passed", () => {
    expect(dueReminder(deadline, [7, 2], [], deadline.getTime() + 1)).toBe(
      null,
    );
  });
});

describe("daysUntil / planProgress", () => {
  it("rounds the days up", () => {
    const deadline = new Date("2026-12-18T18:00:00Z");
    expect(daysUntil(deadline, deadline.getTime() - DAY - 1)).toBe(2);
    expect(daysUntil(deadline, deadline.getTime())).toBe(0);
  });

  it("is a 0..1 share", () => {
    expect(planProgress({ paidMinor: 5_250, totalMinor: 21_000 })).toBe(0.25);
    expect(planProgress({ paidMinor: 0, totalMinor: 0 })).toBe(0);
  });
});
