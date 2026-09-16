import type { ContentPromotionPricing } from "@abonten/types/contentType";
import { describe, expect, it } from "vitest";
import { pricingProblem } from "./contentPromotionPricingAdminCore";

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

describe("promotion pricing rules", () => {
  it("accepts the seeded defaults", () => {
    expect(pricingProblem(pricing)).toBeNull();
  });
  it("needs a share for exactly the distances advertisers can choose", () => {
    expect(
      pricingProblem({
        ...pricing,
        locationAudienceShareByRadiusBps: { "5": 1000, "25": 3000 },
      }),
    ).toMatch(/each distance/);
    expect(
      pricingProblem({
        ...pricing,
        locationAudienceShareByRadiusBps: {
          ...pricing.locationAudienceShareByRadiusBps,
          "100": 6000,
        },
      }),
    ).toMatch(/each distance/);
  });
  it("refuses a wider distance with a smaller share", () => {
    expect(
      pricingProblem({
        ...pricing,
        locationAudienceShareByRadiusBps: {
          "5": 1000,
          "10": 900,
          "25": 3000,
          "50": 4500,
        },
      }),
    ).toMatch(/wider distance/);
  });
});
