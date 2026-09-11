import type { LoyaltyProgress, RewardsProgram } from "@abonten/types/rewards";
import { describe, expect, it } from "vitest";
import { loyaltyProgressCopy, rewardsEarnLines } from "./earnCopy";

const OFF: RewardsProgram = {
  enabled: true,
  eventReferral: null,
  friendReferral: null,
  organizerRebate: null,
  venueRebate: null,
  organizerMilestone: null,
  loyaltyFeeRebate: null,
  promoterCommission: null,
  placeVisits: null,
  redemption: {
    tickets: false,
    promotions: false,
    allowFullCreditTicketOrders: false,
    minCashChargeMinor: 100,
  },
  withdrawals: { enabled: false, minMinor: 10000 },
};

describe("rewardsEarnLines", () => {
  it("promises nothing that isn't live", () => {
    expect(rewardsEarnLines(OFF)).toEqual([]);
  });

  it("describes the Phase 8 rewards from their live terms", () => {
    const lines = rewardsEarnLines({
      ...OFF,
      loyaltyFeeRebate: {
        ordersRequired: 5,
        windowDays: 90,
        maxMinor: 1000,
        feeShareBps: 10000,
        minOrderMinor: 2000,
        expiryDays: 365,
      },
      promoterCommission: {
        minRateBps: 100,
        maxRateBps: 3000,
        expiryDays: 365,
      },
      placeVisits: {
        perVisitorMinor: 50,
        maxVisitors: 40,
        radiusM: 150,
        expiryDays: 180,
      },
      eventReferral: { rateBps: 100, minOrderMinor: 2000, expiryDays: 365 },
    });
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("you earn 1% of the ticket price");
    expect(lines[1]).toContain("paid by the organizer");
    expect(lines[2]).toContain("5 different events within 90 days");
    expect(lines[2]).toContain("up to GH₵ 10.00");
    expect(lines[3]).toContain(
      "GH₵ 0.50 of promotion credit (up to 40 a month)",
    );
  });
});

describe("loyaltyProgressCopy", () => {
  const base: LoyaltyProgress = {
    ordersRequired: 5,
    windowDays: 90,
    minOrderMinor: 2000,
    feeShareBps: 10000,
    maxPerRewardMinor: 1000,
    ordersCounted: 0,
    oldestCountsUntil: null,
    pendingMinor: 0,
    earnedMinor: 0,
  };

  it("counts down to the reward", () => {
    expect(loyaltyProgressCopy({ ...base, ordersCounted: 3 })).toEqual({
      headline: "3 of 5 events",
      detail:
        "2 more ticket orders of GH₵ 20.00 or more to different events within 90 days and we give you back the service fee on the last one as credit (up to GH₵ 10.00).",
    });
    expect(loyaltyProgressCopy({ ...base, ordersCounted: 4 }).detail).toMatch(
      /^One more ticket order of GH₵ 20.00 or more/,
    );
    expect(loyaltyProgressCopy({ ...base, ordersCounted: 5 }).detail).toMatch(
      /comes back as credit/,
    );
  });
});
