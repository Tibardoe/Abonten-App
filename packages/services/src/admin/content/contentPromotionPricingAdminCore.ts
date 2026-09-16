import { estimatePromotionReach } from "@abonten/core/content/promotionEstimate";
import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  ContentPromotionAudience,
  ContentPromotionEstimate,
  ContentPromotionPricing,
} from "@abonten/types/contentType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type PromotionPricingInput,
  RADIUS_OPTIONS_KM,
} from "@abonten/validation/contentSchemas";
import {
  mapPromotionPricing,
  readPromotionAudience,
  readPromotionPricing,
} from "../../content/campaigns/contentPromotionCore";
import { readContentSettings } from "../../content/contentProgram";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Spotlight & Stories › Settings › Promotion pricing. Reads need
// spotlight.view; changes need spotlight.configure plus step-up (checked by
// the admin transport), a reason and the row's current version. A change
// applies to promotions created afterwards only — every campaign keeps the
// pricing snapshot it was sold with.

type RequestMeta = Record<string, unknown> | undefined;
const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

export type PromotionPricingAdminView = {
  pricing: ContentPromotionPricing;
  audience: ContentPromotionAudience;
  dailyCapPerViewer: number;
  /** What each suggested budget estimates today, over the default run. */
  examples: ContentPromotionEstimate[];
};

export async function getPromotionPricingAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<PromotionPricingAdminView>> {
  try {
    assertPermission(ctx, "spotlight.view");
  } catch (e) {
    return denied(e);
  }
  const [pricing, audience, settings] = await Promise.all([
    readPromotionPricing(supabase),
    readPromotionAudience(supabase),
    readContentSettings(supabase, { fresh: true }),
  ]);
  if (!pricing || !settings) {
    return { status: 500, message: "Couldn't load promotion pricing." };
  }
  const dailyCapPerViewer = settings.sponsored_daily_cap_per_viewer;
  const examples = pricing.suggestedBudgetsMinor.map((budgetMinor) =>
    estimatePromotionReach({
      pricing,
      audience,
      dailyCapPerViewer,
      budgetMinor,
      durationDays: pricing.defaultDurationDays,
      targeting: { radiusKm: null },
    }),
  );
  return {
    status: 200,
    data: { pricing, audience, dailyCapPerViewer, examples },
  };
}

const COLUMN: Record<keyof PromotionPricingInput["patch"], string> = {
  minBudgetMinor: "min_budget_minor",
  maxBudgetMinor: "max_budget_minor",
  budgetStepMinor: "budget_step_minor",
  suggestedBudgetsMinor: "suggested_budgets_minor",
  durationOptionsDays: "duration_options_days",
  defaultDurationDays: "default_duration_days",
  cpmMinor: "cpm_minor",
  avgFrequency: "avg_frequency",
  estimateSpreadBps: "estimate_spread_bps",
  audienceFloorDailyViewers: "audience_floor_daily_viewers",
  audienceFloorReach: "audience_floor_reach",
  dailyFillBps: "daily_fill_bps",
  maxReachShareBps: "max_reach_share_bps",
  locationAudienceShareByRadiusBps: "location_audience_share_by_radius",
  categoryAudienceShareBps: "category_audience_share_bps",
  minDeliverableBps: "min_deliverable_bps",
  pacingMultiplier: "pacing_multiplier",
};

export async function updatePromotionPricingAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: PromotionPricingInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<ContentPromotionPricing>> {
  try {
    assertPermission(ctx, "spotlight.configure");
  } catch (e) {
    return denied(e);
  }
  const before = await readPromotionPricing(supabase);
  if (!before) return { status: 500, message: "Couldn't load pricing." };
  if (before.version !== input.expectedVersion) {
    return {
      status: 409,
      message: "Someone else changed the pricing. Reload and try again.",
    };
  }

  const merged = { ...before, ...input.patch };
  const problem = pricingProblem(merged);
  if (problem) return { status: 400, message: problem };

  const update: Record<string, unknown> = {};
  const changed: (keyof ContentPromotionPricing)[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = COLUMN[key as keyof typeof COLUMN];
    if (!column || value === undefined) continue;
    if (
      JSON.stringify(before[key as keyof ContentPromotionPricing]) ===
      JSON.stringify(value)
    ) {
      continue;
    }
    update[column] = value;
    changed.push(key as keyof ContentPromotionPricing);
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };
  update.version = before.version + 1;
  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("content_promotion_pricing")
    .update(update as never)
    .eq("id", 1)
    .eq("version", input.expectedVersion)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error(`updatePromotionPricingAdminCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the pricing." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed the pricing. Reload and try again.",
    };
  }
  const after = mapPromotionPricing(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "spotlight.promotion_pricing.update",
    targetType: "content_promotion_pricing",
    targetId: "1",
    summary: `Promotion pricing v${before.version} → v${after.version}: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Pricing saved.", data: after };
}

/** Cross-field rules the column checks can't express. */
export function pricingProblem(p: ContentPromotionPricing): string | null {
  if (p.maxBudgetMinor < p.minBudgetMinor) {
    return "The largest budget must be at least the smallest.";
  }
  if (p.minBudgetMinor % p.budgetStepMinor !== 0) {
    return "The smallest budget must be a whole number of steps.";
  }
  for (const b of p.suggestedBudgetsMinor) {
    if (b < p.minBudgetMinor || b > p.maxBudgetMinor || b % p.budgetStepMinor) {
      return "Every suggested budget must be within the range and a whole number of steps.";
    }
  }
  if (!p.durationOptionsDays.includes(p.defaultDurationDays)) {
    return "The default run length must be one of the options.";
  }
  const radii = Object.keys(p.locationAudienceShareByRadiusBps)
    .map(Number)
    .sort((a, b) => a - b);
  if (radii.join(",") !== [...RADIUS_OPTIONS_KM].join(",")) {
    return `Give an audience share for each distance: ${RADIUS_OPTIONS_KM.join(", ")} km.`;
  }
  for (let i = 1; i < radii.length; i += 1) {
    if (
      p.locationAudienceShareByRadiusBps[String(radii[i])] <
      p.locationAudienceShareByRadiusBps[String(radii[i - 1])]
    ) {
      return "A wider distance can't have a smaller audience share.";
    }
  }
  if (Math.floor((p.minBudgetMinor * 1000) / p.cpmMinor) < 1) {
    return "The smallest budget must buy at least one impression.";
  }
  return null;
}
