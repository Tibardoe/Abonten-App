"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import {
  campaignActionAdminCore,
  refundCampaignAdminCore,
} from "@abonten/services/admin/content/contentCampaignAdminCore";
import { updateContentSettingsCore } from "@abonten/services/admin/content/contentPlatformAdminCore";
import { updatePromotionPricingAdminCore } from "@abonten/services/admin/content/contentPromotionPricingAdminCore";
import {
  adminCampaignActionSchema,
  adminCampaignRefundSchema,
  contentSettingsSchema,
  promotionPricingSchema,
} from "@abonten/validation/contentSchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Spotlight + Stories ─────────────────────────────────────
// spotlight.configure and spotlight.campaigns.review are in
// STEP_UP_PERMISSIONS; a refund also needs finance.refund.

export async function updateContentSettings(input: unknown) {
  const parsed = contentSettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateContentSettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/spotlight");
      revalidatePath("/spotlight/settings");
    }
    return res;
  } catch (e) {
    return adminError(e, "updateContentSettings");
  }
}

export async function updatePromotionPricing(input: unknown) {
  const parsed = promotionPricingSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updatePromotionPricingAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/spotlight/settings");
    return res;
  } catch (e) {
    return adminError(e, "updatePromotionPricing");
  }
}

export async function contentCampaignAction(input: unknown) {
  const parsed = adminCampaignActionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await campaignActionAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/spotlight/campaigns");
      revalidatePath(`/spotlight/campaigns/${parsed.data.campaignId}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "contentCampaignAction");
  }
}

export async function refundContentCampaign(input: unknown) {
  const parsed = adminCampaignRefundSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await refundCampaignAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/spotlight/campaigns");
      revalidatePath(`/spotlight/campaigns/${parsed.data.campaignId}`);
      revalidatePath("/finance");
    }
    return res;
  } catch (e) {
    return adminError(e, "refundContentCampaign");
  }
}
