import type {
  ContentPromotionAudience,
  ContentPromotionPricing,
} from "@abonten/types/contentType";
import { describe, expect, it } from "vitest";
import {
  budgetProblem,
  durationProblem,
  estimatePromotionReach,
  formatReachRange,
  locationShareBps,
  roundReach,
} from "./promotionEstimate";

// The seeded defaults of content_promotion_pricing.
const pricing: ContentPromotionPricing = {
  version: 1,
  currency: "GHS",
  minBudgetMinor: 2000,
  maxBudgetMinor: 500000,
  budgetStepMinor: 500,
  suggestedBudgetsMinor: [2000, 5000, 10000],
  durationOptionsDays: [3, 7, 14],
  defaultDurationDays: 7,
  cpmMinor: 1100,
  avgFrequency: 1.5,
  estimateSpreadBps: 2000,
  audienceFloorDailyViewers: 0,
  audienceFloorReach: 0,
  dailyFillBps: 3000,
  maxReachShareBps: 6000,
  locationAudienceShareByRadiusBps: {
    "5": 1000,
    "10": 1800,
    "25": 3000,
    "50": 4500,
  },
  categoryAudienceShareBps: 5000,
  minDeliverableBps: 5000,
  pacingMultiplier: 2,
  updatedAt: "2026-09-16T00:00:00Z",
  updatedBy: null,
};

const bigAudience: ContentPromotionAudience = {
  dailyViewers: 20000,
  reach28d: 60000,
  daysObserved: 14,
  computedAt: "2026-09-16T03:15:00Z",
};

const estimate = (
  budgetMinor: number,
  overrides: Partial<Parameters<typeof estimatePromotionReach>[0]> = {},
) =>
  estimatePromotionReach({
    pricing,
    audience: bigAudience,
    dailyCapPerViewer: 3,
    budgetMinor,
    durationDays: 7,
    targeting: { radiusKm: null },
    ...overrides,
  });

describe("promotion budget rules", () => {
  it("accepts budgets in range and on the step", () => {
    expect(budgetProblem(pricing, 5000)).toBeNull();
    expect(budgetProblem(pricing, 2000)).toBeNull();
  });
  it("refuses budgets out of range, off the step or not whole pesewas", () => {
    expect(budgetProblem(pricing, 1500)).toMatch(/smallest/);
    expect(budgetProblem(pricing, 600000)).toMatch(/largest/);
    expect(budgetProblem(pricing, 5250)).toMatch(/steps/);
    expect(budgetProblem(pricing, 50.5)).toMatch(/Choose/);
    expect(budgetProblem(pricing, 0)).toMatch(/Choose/);
  });
  it("only allows the configured run lengths", () => {
    expect(durationProblem(pricing, 7)).toBeNull();
    expect(durationProblem(pricing, 5)).not.toBeNull();
  });
});

describe("estimated reach", () => {
  it("buys impressions at the cost per 1,000 and shows a range", () => {
    const e = estimate(5000);
    expect(e.impressionGoal).toBe(4545);
    expect(e.estimatedImpressions).toBe(4545);
    // 4,545 / 1.5 = 3,030 people, ±20 %
    expect(e.reachLow).toBe(2400);
    expect(e.reachHigh).toBe(3700);
    expect(e.basis).toBe("observed");
    expect(e.deliverable).toBe(true);
    expect(e.limitedBy).toBe("budget");
  });
  it("grows with the budget", () => {
    const a = estimate(2000);
    const b = estimate(5000);
    const c = estimate(10000);
    expect(a.reachHigh).toBeLessThan(b.reachHigh);
    expect(b.reachHigh).toBeLessThan(c.reachHigh);
  });
  it("is deterministic", () => {
    expect(estimate(10000)).toEqual(estimate(10000));
  });
  it("never estimates more people than the audience allows", () => {
    const e = estimate(500000, {
      audience: { ...bigAudience, dailyViewers: 1000, reach28d: 2000 },
    });
    // 60 % of a 2,000-person audience
    expect(e.reachHigh).toBeLessThanOrEqual(1200);
    expect(e.limitedBy).toBe("audience");
    expect(e.deliverable).toBe(false);
  });
  it("shrinks the audience for a location target", () => {
    const small = { ...bigAudience, dailyViewers: 500, reach28d: 1500 };
    const everywhere = estimate(5000, { audience: small });
    const near = estimate(5000, {
      audience: small,
      targeting: { radiusKm: 25 },
    });
    expect(near.estimatedImpressions).toBeLessThan(
      everywhere.estimatedImpressions,
    );
  });
  it("estimates a smaller audience for a smaller radius", () => {
    const small = { ...bigAudience, dailyViewers: 2000, reach28d: 6000 };
    const at = (radiusKm: number) =>
      estimate(10000, { audience: small, targeting: { radiusKm } });
    const [r5, r10, r25, r50] = [at(5), at(10), at(25), at(50)];
    expect(r5.estimatedImpressions).toBeLessThan(r10.estimatedImpressions);
    expect(r10.estimatedImpressions).toBeLessThan(r25.estimatedImpressions);
    expect(r25.estimatedImpressions).toBeLessThan(r50.estimatedImpressions);
    expect(r5.reachHigh).toBeLessThanOrEqual(r50.reachHigh);
  });
  it("reads the share for a radius, the next wider one, or the widest", () => {
    expect(locationShareBps(pricing, 10)).toBe(1800);
    expect(locationShareBps(pricing, 7)).toBe(1800);
    expect(locationShareBps(pricing, 80)).toBe(4500);
    expect(locationShareBps({ locationAudienceShareByRadiusBps: {} }, 10)).toBe(
      0,
    );
  });
  it("can't estimate without audience data and refuses to sell", () => {
    const e = estimate(5000, {
      audience: {
        dailyViewers: 0,
        reach28d: 0,
        daysObserved: 0,
        computedAt: null,
      },
    });
    expect(e.basis).toBe("no_data");
    expect(e.deliverable).toBe(false);
    expect(e.reachHigh).toBe(0);
  });
  it("says when the planning floor was used", () => {
    const e = estimate(5000, {
      pricing: {
        ...pricing,
        audienceFloorDailyViewers: 5000,
        audienceFloorReach: 20000,
      },
      audience: {
        dailyViewers: 10,
        reach28d: 40,
        daysObserved: 3,
        computedAt: null,
      },
    });
    expect(e.basis).toBe("assumed");
    expect(e.deliverable).toBe(true);
  });
  it("refuses a budget the run is too short to deliver", () => {
    const e = estimate(500000, { durationDays: 3 });
    expect(e.deliverableBps).toBeLessThan(pricing.minDeliverableBps);
    expect(e.deliverable).toBe(false);
  });
  it("a higher cost per 1,000 buys fewer impressions", () => {
    const cheap = estimate(5000);
    const dear = estimate(5000, { pricing: { ...pricing, cpmMinor: 2200 } });
    expect(dear.impressionGoal).toBe(2272);
    expect(dear.reachHigh).toBeLessThan(cheap.reachHigh);
  });
});

describe("reach formatting", () => {
  it("rounds to human numbers", () => {
    expect(roundReach(37, "down")).toBe(30);
    expect(roundReach(437, "up")).toBe(450);
    expect(roundReach(3030, "down")).toBe(3000);
    expect(roundReach(-5, "up")).toBe(0);
  });
  it("formats a range", () => {
    expect(formatReachRange({ reachLow: 2400, reachHigh: 3700 })).toBe(
      "2,400–3,700 people",
    );
    expect(formatReachRange({ reachLow: 50, reachHigh: 50 })).toBe(
      "About 50 people",
    );
  });
});
