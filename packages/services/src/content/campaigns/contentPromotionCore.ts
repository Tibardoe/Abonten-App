import {
  budgetProblem,
  durationProblem,
  estimatePromotionReach,
} from "@abonten/core/content/promotionEstimate";
import { logger } from "@abonten/core/logger";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import type {
  ContentPromotionAudience,
  ContentPromotionEstimate,
  ContentPromotionOptions,
  ContentPromotionPricing,
} from "@abonten/types/contentType";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type EstimateContentPromotionInput,
  RADIUS_OPTIONS_KM,
} from "@abonten/validation/contentSchemas";
import { resolveContentAccess } from "../contentProgram";
import { type Envelope, FAIL, accountIsRestricted } from "../contentShared";

// Pricing and reach estimates for promoted Spotlights. The server is the
// only place a promotion is priced: the apps send a budget, a run length
// and an audience choice, and get back what the server decided. The same
// quote is recomputed when the campaign is created, so an estimate the
// client kept (or edited) is never trusted.

type PricingRow =
  Database["public"]["Tables"]["content_promotion_pricing"]["Row"];

export function mapPromotionPricing(row: PricingRow): ContentPromotionPricing {
  return {
    version: row.version,
    currency: row.currency,
    minBudgetMinor: Number(row.min_budget_minor),
    maxBudgetMinor: Number(row.max_budget_minor),
    budgetStepMinor: Number(row.budget_step_minor),
    suggestedBudgetsMinor: (row.suggested_budgets_minor ?? []).map(Number),
    durationOptionsDays: (row.duration_options_days ?? []).map(Number),
    defaultDurationDays: row.default_duration_days,
    cpmMinor: row.cpm_minor,
    avgFrequency: Number(row.avg_frequency),
    estimateSpreadBps: row.estimate_spread_bps,
    audienceFloorDailyViewers: row.audience_floor_daily_viewers,
    audienceFloorReach: row.audience_floor_reach,
    dailyFillBps: row.daily_fill_bps,
    maxReachShareBps: row.max_reach_share_bps,
    locationAudienceShareByRadiusBps: shareByRadius(
      row.location_audience_share_by_radius,
    ),
    categoryAudienceShareBps: row.category_audience_share_bps,
    minDeliverableBps: row.min_deliverable_bps,
    pacingMultiplier: Number(row.pacing_multiplier),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function readPromotionPricing(
  supabase: ServiceRoleClient,
): Promise<ContentPromotionPricing | null> {
  const { data, error } = await supabase
    .from("content_promotion_pricing")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`readPromotionPricing failed: ${error.message}`);
    return null;
  }
  return data ? mapPromotionPricing(data) : null;
}

export async function readPromotionAudience(
  supabase: ServiceRoleClient,
): Promise<ContentPromotionAudience> {
  const { data, error } = await supabase
    .from("content_audience_snapshot")
    .select("daily_viewers, reach_28d, days_observed, computed_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`readPromotionAudience failed: ${error.message}`);
  }
  return {
    dailyViewers: data?.daily_viewers ?? 0,
    reach28d: data?.reach_28d ?? 0,
    daysObserved: data?.days_observed ?? 0,
    computedAt: data?.computed_at ?? null,
  };
}

export function promotionOptions(
  pricing: ContentPromotionPricing,
): ContentPromotionOptions {
  return {
    currency: pricing.currency,
    minBudgetMinor: pricing.minBudgetMinor,
    maxBudgetMinor: pricing.maxBudgetMinor,
    budgetStepMinor: pricing.budgetStepMinor,
    suggestedBudgetsMinor: pricing.suggestedBudgetsMinor,
    durationOptionsDays: pricing.durationOptionsDays,
    defaultDurationDays: pricing.defaultDurationDays,
    radiusOptionsKm: [...RADIUS_OPTIONS_KM],
  };
}

export async function getPromotionOptionsCore(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<Envelope<ContentPromotionOptions>> {
  const { program } = await resolveContentAccess(supabase, userId);
  if (!program.spotlightPromotions) {
    return { status: 403, message: "Promotions aren't available yet." };
  }
  const pricing = await readPromotionPricing(supabase);
  if (!pricing) return FAIL;
  return { status: 200, data: promotionOptions(pricing) };
}

export type PromotionQuote = {
  pricing: ContentPromotionPricing;
  estimate: ContentPromotionEstimate;
  post: {
    id: string;
    currency: string;
    targetingLocation: string | null;
    targetingRadiusKm: number | null;
  };
};

/**
 * Checks the caller may promote this post and prices the request. Used by
 * the estimate endpoints and, again, by campaign creation.
 */
export async function quotePromotion(
  supabase: ServiceRoleClient,
  userId: string,
  input: EstimateContentPromotionInput,
): Promise<Envelope<PromotionQuote>> {
  const { program, settings } = await resolveContentAccess(supabase, userId);
  if (!program.spotlightPromotions || !settings) {
    return { status: 403, message: "Promotions aren't available yet." };
  }
  if (await accountIsRestricted(supabase, userId)) {
    return { status: 403, message: "Your account has been restricted." };
  }
  const { data: post } = await supabase
    .from("content_post")
    .select("id, kind, author_id, status, moderation_state, location")
    .eq("id", input.postId)
    .maybeSingle();
  if (!post || post.author_id !== userId) {
    return { status: 404, message: "Spotlight not found." };
  }
  if (post.kind !== "spotlight") {
    return { status: 400, message: "Only a Spotlight can be promoted." };
  }
  if (post.status !== "published" || post.moderation_state !== "visible") {
    return {
      status: 400,
      message: "Only a live Spotlight can be promoted.",
    };
  }
  const pricing = await readPromotionPricing(supabase);
  if (!pricing) return FAIL;

  const budgetError = budgetProblem(pricing, input.budgetMinor);
  if (budgetError) return { status: 400, message: budgetError };
  const durationError = durationProblem(pricing, input.durationDays);
  if (durationError) return { status: 400, message: durationError };

  let targetingLocation: string | null = null;
  let targetingRadiusKm: number | null = null;
  if (input.targeting.area === "near_post") {
    const point = pointFromWkb(post.location);
    if (!point) {
      return {
        status: 400,
        message:
          "This Spotlight has no location. Link an event or place, or show it everywhere.",
      };
    }
    targetingLocation = `SRID=4326;POINT(${point.lng} ${point.lat})`;
    targetingRadiusKm = input.targeting.radiusKm;
  }

  const audience = await readPromotionAudience(supabase);
  const estimate = estimatePromotionReach({
    pricing,
    audience,
    dailyCapPerViewer: settings.sponsored_daily_cap_per_viewer,
    budgetMinor: input.budgetMinor,
    durationDays: input.durationDays,
    targeting: {
      radiusKm: targetingLocation === null ? null : targetingRadiusKm,
    },
  });
  return {
    status: 200,
    data: {
      pricing,
      estimate,
      post: {
        id: post.id,
        currency: pricing.currency,
        targetingLocation,
        targetingRadiusKm,
      },
    },
  };
}

export async function estimateContentPromotionCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: EstimateContentPromotionInput,
): Promise<Envelope<ContentPromotionEstimate>> {
  const quote = await quotePromotion(supabase, userId, input);
  if (quote.status !== 200 || !quote.data) {
    return { status: quote.status, message: quote.message };
  }
  return { status: 200, data: quote.data.estimate };
}

/** Why a quote can't be sold, in words an advertiser can act on. */
export function undeliverableMessage(
  estimate: ContentPromotionEstimate,
): string {
  if (estimate.basis === "no_data") {
    return "We can't estimate reach for promotions yet. Please try again later.";
  }
  return "The audience for this promotion is too small for this budget right now. Lower the budget, let it run longer or show it to a wider area.";
}

function shareByRadius(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [km, bps] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(bps);
    if (/^\d+$/.test(km) && Number.isFinite(n)) out[km] = n;
  }
  return out;
}

function pointFromWkb(raw: unknown): { lat: number; lng: number } | null {
  if (typeof raw !== "string" || raw.length < 42) return null;
  try {
    const { eventLat, eventLng } = parseWKBHex(raw);
    return Number.isFinite(eventLat) && Number.isFinite(eventLng)
      ? { lat: eventLat, lng: eventLng }
      : null;
  } catch {
    return null;
  }
}
