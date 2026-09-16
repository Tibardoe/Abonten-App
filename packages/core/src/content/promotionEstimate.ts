import type {
  ContentPromotionAudience,
  ContentPromotionEstimate,
  ContentPromotionPricing,
} from "@abonten/types/contentType";

// The reach estimate for a promoted Spotlight. Pure and deterministic so the
// server (the only place a price or an estimate is decided) and the unit
// tests agree exactly; the apps only display what the server returns.
//
// Model, in the order it is applied:
//   1. impression goal   = floor(budget × 1000 ÷ cost per 1,000 impressions)
//      — what the budget pays for, and where delivery stops.
//   2. audience          = observed daily viewers / 28-day distinct viewers,
//      or the admin-set floor when observed data is thinner, times the share
//      assumed to be within the chosen radius of a location target.
//   3. deliverable       = daily audience × run days × per-viewer daily cap ×
//      expected fill. Fewer impressions than the goal means the run is too
//      short or the audience too small for the budget.
//   4. reach             = expected impressions ÷ average frequency, never
//      more than max_reach_share of the audience, shown as a ± range.
// Nothing here is a promise; the UI always says "estimated".

export type PromotionEstimateInput = {
  pricing: ContentPromotionPricing;
  audience: ContentPromotionAudience;
  /** content_program_setting.sponsored_daily_cap_per_viewer */
  dailyCapPerViewer: number;
  budgetMinor: number;
  durationDays: number;
  /** Null = shown everywhere; otherwise the location target's radius. */
  targeting: { radiusKm: number | null };
};

/** A human-sized number: tens under 100, fifties under 1,000, then hundreds. */
export function roundReach(n: number, direction: "down" | "up"): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = n < 100 ? 10 : n < 1000 ? 50 : 100;
  const f = direction === "down" ? Math.floor : Math.ceil;
  return f(n / step) * step;
}

/** Null when the budget is acceptable, otherwise the reason. */
export function budgetProblem(
  pricing: Pick<
    ContentPromotionPricing,
    "minBudgetMinor" | "maxBudgetMinor" | "budgetStepMinor"
  >,
  budgetMinor: number,
): string | null {
  if (!Number.isInteger(budgetMinor) || budgetMinor <= 0) {
    return "Choose a budget.";
  }
  if (budgetMinor < pricing.minBudgetMinor) {
    return `The smallest budget is ${cedis(pricing.minBudgetMinor)}.`;
  }
  if (budgetMinor > pricing.maxBudgetMinor) {
    return `The largest budget is ${cedis(pricing.maxBudgetMinor)}.`;
  }
  if (budgetMinor % pricing.budgetStepMinor !== 0) {
    return `Budgets go up in steps of ${cedis(pricing.budgetStepMinor)}.`;
  }
  return null;
}

export function durationProblem(
  pricing: Pick<ContentPromotionPricing, "durationOptionsDays">,
  durationDays: number,
): string | null {
  return pricing.durationOptionsDays.includes(durationDays)
    ? null
    : "Choose how long the promotion can run.";
}

/**
 * Audience share (basis points) assumed within a radius: the configured
 * figure for that radius, else the nearest configured larger radius, else
 * the largest. Nothing configured means no estimate can be made.
 */
export function locationShareBps(
  pricing: Pick<ContentPromotionPricing, "locationAudienceShareByRadiusBps">,
  radiusKm: number,
): number {
  const entries = Object.entries(pricing.locationAudienceShareByRadiusBps ?? {})
    .map(([km, bps]) => [Number(km), Number(bps)] as const)
    .filter(([km, bps]) => Number.isFinite(km) && Number.isFinite(bps))
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return 0;
  const match =
    entries.find(([km]) => km >= radiusKm) ?? entries[entries.length - 1];
  return Math.min(10_000, Math.max(0, match[1]));
}

export function estimatePromotionReach(
  input: PromotionEstimateInput,
): ContentPromotionEstimate {
  const { pricing, audience, budgetMinor, durationDays } = input;
  const impressionGoal = Math.floor((budgetMinor * 1000) / pricing.cpmMinor);

  const observedDaily = Math.max(0, audience.dailyViewers);
  const observedReach = Math.max(0, audience.reach28d);
  const useFloor =
    pricing.audienceFloorDailyViewers > observedDaily ||
    pricing.audienceFloorReach > observedReach;
  const daily = Math.max(observedDaily, pricing.audienceFloorDailyViewers);
  const pool = Math.max(observedReach, pricing.audienceFloorReach, daily);
  const basis: ContentPromotionEstimate["basis"] =
    daily <= 0 || pool <= 0 ? "no_data" : useFloor ? "assumed" : "observed";

  const share =
    input.targeting.radiusKm === null
      ? 1
      : locationShareBps(pricing, input.targeting.radiusKm) / 10_000;
  const maxImpressions = Math.floor(
    daily *
      share *
      durationDays *
      Math.max(0, input.dailyCapPerViewer) *
      (pricing.dailyFillBps / 10_000),
  );
  const maxReach = Math.floor(
    pool * share * (pricing.maxReachShareBps / 10_000),
  );

  const estimatedImpressions = Math.max(
    0,
    Math.min(impressionGoal, maxImpressions),
  );
  const mid = Math.min(estimatedImpressions / pricing.avgFrequency, maxReach);
  const spread = pricing.estimateSpreadBps / 10_000;
  const reachLow = roundReach(mid * (1 - spread), "down");
  const reachHigh = Math.max(
    reachLow,
    Math.min(
      roundReach(mid * (1 + spread), "up"),
      roundReach(maxReach, "down"),
    ),
  );
  const deliverableBps =
    impressionGoal > 0
      ? Math.min(
          10_000,
          Math.floor((estimatedImpressions * 10_000) / impressionGoal),
        )
      : 0;

  return {
    pricingVersion: pricing.version,
    currency: pricing.currency,
    budgetMinor,
    durationDays,
    cpmMinor: pricing.cpmMinor,
    impressionGoal,
    estimatedImpressions,
    reachLow,
    reachHigh,
    basis,
    deliverableBps,
    deliverable:
      basis !== "no_data" &&
      impressionGoal > 0 &&
      reachHigh > 0 &&
      deliverableBps >= pricing.minDeliverableBps,
    limitedBy: estimatedImpressions < impressionGoal ? "audience" : "budget",
  };
}

/** "2,400–3,700 people" */
export function formatReachRange(estimate: {
  reachLow: number;
  reachHigh: number;
}): string {
  const f = (n: number) => n.toLocaleString("en-GB");
  return estimate.reachLow === estimate.reachHigh
    ? `About ${f(estimate.reachLow)} people`
    : `${f(estimate.reachLow)}–${f(estimate.reachHigh)} people`;
}

function cedis(minor: number): string {
  const v = minor / 100;
  return `GH₵ ${Number.isInteger(v) ? v.toString() : v.toFixed(2)}`;
}
