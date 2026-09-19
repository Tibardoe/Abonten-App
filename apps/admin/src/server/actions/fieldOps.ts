"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import { exportCampaignStatsCsvCore } from "@abonten/services/admin/fieldOps/analyticsAdminCore";
import {
  setCampaignStatusCore,
  upsertCampaignCore,
} from "@abonten/services/admin/fieldOps/campaignsAdminCore";
import { reverseCommissionAdminCore } from "@abonten/services/admin/fieldOps/commissionsAdminCore";
import {
  reviewContentAdminCore,
  runMonthlyStipendsCore,
} from "@abonten/services/admin/fieldOps/contentAdminCore";
import { decideOnboardingAdminCore } from "@abonten/services/admin/fieldOps/onboardingsAdminCore";
import {
  approvePayoutBatchCore,
  buildPayoutBatchCore,
  cancelPayoutBatchCore,
  exportPayoutBatchCsvCore,
  markPayoutItemCore,
} from "@abonten/services/admin/fieldOps/payoutsAdminCore";
import {
  geocodeQueryCore,
  upsertRegionCore,
  upsertTerritoryCore,
} from "@abonten/services/admin/fieldOps/regionsAdminCore";
import { decideFlagAdminCore } from "@abonten/services/admin/fieldOps/reviewQueueAdminCore";
import {
  publishCommissionRuleVersionCore,
  setCommissionRuleActiveCore,
} from "@abonten/services/admin/fieldOps/rulesAdminCore";
import { updateFieldOpsSettingsCore } from "@abonten/services/admin/fieldOps/settingsAdminCore";
import {
  addTeamMemberCore,
  setTeamMemberRoleCore,
  setTeamMemberStatusCore,
} from "@abonten/services/admin/fieldOps/teamAdminCore";
import {
  fieldOpsAddMemberSchema,
  fieldOpsAdminCommissionReverseSchema,
  fieldOpsAdminFlagDecisionSchema,
  fieldOpsAdminOnboardingDecisionSchema,
  fieldOpsCampaignSchema,
  fieldOpsCampaignStatusChangeSchema,
  fieldOpsContentReviewSchema,
  fieldOpsGeocodeSchema,
  fieldOpsMemberRoleChangeSchema,
  fieldOpsMemberStatusSchema,
  fieldOpsPayoutBatchBuildSchema,
  fieldOpsPayoutBatchRefSchema,
  fieldOpsPayoutItemMarkSchema,
  fieldOpsRegionSchema,
  fieldOpsRuleActivationSchema,
  fieldOpsRuleVersionSchema,
  fieldOpsSettingsSchema,
  fieldOpsStipendRunSchema,
  fieldOpsTerritorySchema,
} from "@abonten/validation/fieldOpsSchemas";
import { revalidatePath } from "next/cache";
import { adminError, firstIssue, svc } from "./_shared";

// ── Field Ops (regional promotion programme) ────────────────
// fieldops.manage / fieldops.rules are in STEP_UP_PERMISSIONS: every
// configuration change below asserts a fresh identity check.

export async function updateFieldOpsSettings(input: unknown) {
  const parsed = fieldOpsSettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateFieldOpsSettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops");
      revalidatePath("/field-ops/settings");
    }
    return res;
  } catch (e) {
    return adminError(e, "updateFieldOpsSettings");
  }
}

export async function upsertFieldOpsRegion(input: unknown) {
  const parsed = fieldOpsRegionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await upsertRegionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/regions");
      if (res.data) revalidatePath(`/field-ops/regions/${res.data.id}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "upsertFieldOpsRegion");
  }
}

export async function upsertFieldOpsTerritory(input: unknown) {
  const parsed = fieldOpsTerritorySchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await upsertTerritoryCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/regions");
      revalidatePath(`/field-ops/regions/${parsed.data.regionId}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "upsertFieldOpsTerritory");
  }
}

// Read-only helper for the territory form (Google Geocoding when a key is
// configured). fieldops.manage, no step-up: it changes nothing.
export async function geocodeFieldOpsQuery(input: unknown) {
  const parsed = fieldOpsGeocodeSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    return await geocodeQueryCore(ctx, parsed.data.query);
  } catch (e) {
    return adminError(e, "geocodeFieldOpsQuery");
  }
}

export async function upsertFieldOpsCampaign(input: unknown) {
  const parsed = fieldOpsCampaignSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await upsertCampaignCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops");
      revalidatePath("/field-ops/campaigns");
      if (res.data) revalidatePath(`/field-ops/campaigns/${res.data.id}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "upsertFieldOpsCampaign");
  }
}

export async function setFieldOpsCampaignStatus(input: unknown) {
  const parsed = fieldOpsCampaignStatusChangeSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setCampaignStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops");
      revalidatePath("/field-ops/campaigns");
      revalidatePath(`/field-ops/campaigns/${parsed.data.campaignId}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "setFieldOpsCampaignStatus");
  }
}

export async function addFieldOpsTeamMember(input: unknown) {
  const parsed = fieldOpsAddMemberSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await addTeamMemberCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/field-ops/campaigns/${parsed.data.campaignId}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "addFieldOpsTeamMember");
  }
}

export async function setFieldOpsTeamMemberStatus(input: unknown) {
  const parsed = fieldOpsMemberStatusSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setTeamMemberStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/field-ops/campaigns", "layout");
    return res;
  } catch (e) {
    return adminError(e, "setFieldOpsTeamMemberStatus");
  }
}

export async function setFieldOpsTeamMemberRole(input: unknown) {
  const parsed = fieldOpsMemberRoleChangeSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setTeamMemberRoleCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/field-ops/campaigns", "layout");
    return res;
  } catch (e) {
    return adminError(e, "setFieldOpsTeamMemberRole");
  }
}

export async function publishFieldOpsRuleVersion(input: unknown) {
  const parsed = fieldOpsRuleVersionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await publishCommissionRuleVersionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/rules");
      revalidatePath("/field-ops/campaigns", "layout");
    }
    return res;
  } catch (e) {
    return adminError(e, "publishFieldOpsRuleVersion");
  }
}

export async function setFieldOpsRuleActive(input: unknown) {
  const parsed = fieldOpsRuleActivationSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setCommissionRuleActiveCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/rules");
      revalidatePath("/field-ops");
      revalidatePath("/field-ops/campaigns", "layout");
    }
    return res;
  } catch (e) {
    return adminError(e, "setFieldOpsRuleActive");
  }
}

export async function decideFieldOpsOnboarding(input: unknown) {
  const parsed = fieldOpsAdminOnboardingDecisionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await decideOnboardingAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/onboardings", "layout");
      revalidatePath("/field-ops");
    }
    return res;
  } catch (e) {
    return adminError(e, "decideFieldOpsOnboarding");
  }
}

/** The campaign's team table as a spreadsheet (fieldops.view). */
export async function exportFieldOpsCampaignStats(campaignId: unknown) {
  if (typeof campaignId !== "string") {
    return { status: 400, message: "Invalid campaign" };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    return await exportCampaignStatsCsvCore(svc(), ctx, campaignId);
  } catch (e) {
    return adminError(e, "exportFieldOpsCampaignStats");
  }
}

/** Approves or rejects a content deliverable in the lead's place. */
export async function decideFieldOpsContent(input: unknown) {
  const parsed = fieldOpsContentReviewSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await reviewContentAdminCore(
      svc(),
      ctx,
      {
        submissionId: parsed.data.submissionId,
        decision: parsed.data.decision,
        note: parsed.data.note ?? null,
      },
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/content");
      revalidatePath("/field-ops/commissions", "layout");
    }
    return res;
  } catch (e) {
    return adminError(e, "decideFieldOpsContent");
  }
}

/**
 * Authorises one month of stipends. It creates approved commissions, so it
 * is fieldops.commissions.approve plus step-up, and it is idempotent per
 * member per month.
 */
export async function runFieldOpsStipends(input: unknown) {
  const parsed = fieldOpsStipendRunSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await runMonthlyStipendsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/content");
      revalidatePath("/field-ops/commissions", "layout");
      revalidatePath("/field-ops");
    }
    return res;
  } catch (e) {
    return adminError(e, "runFieldOpsStipends");
  }
}

/** Resolves a flag the eligibility sweep raised (fieldops.verify). */
export async function decideFieldOpsFlag(input: unknown) {
  const parsed = fieldOpsAdminFlagDecisionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await decideFlagAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/review");
      revalidatePath("/field-ops/onboardings", "layout");
      revalidatePath("/field-ops/commissions");
      revalidatePath("/field-ops");
    }
    return res;
  } catch (e) {
    return adminError(e, "decideFieldOpsFlag");
  }
}

// Payout batches move real money, so every one of these is
// fieldops.commissions.approve / .pay plus step-up, and the second-admin
// rule on approval is enforced by a DB CHECK, not by this layer.
export async function buildFieldOpsPayoutBatch(input: unknown) {
  const parsed = fieldOpsPayoutBatchBuildSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await buildPayoutBatchCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/payouts", "layout");
      revalidatePath("/field-ops/commissions", "layout");
      revalidatePath("/field-ops");
    }
    return res;
  } catch (e) {
    return adminError(e, "buildFieldOpsPayoutBatch");
  }
}

export async function approveFieldOpsPayoutBatch(input: unknown) {
  const parsed = fieldOpsPayoutBatchRefSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await approvePayoutBatchCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/field-ops/payouts", "layout");
    return res;
  } catch (e) {
    return adminError(e, "approveFieldOpsPayoutBatch");
  }
}

export async function markFieldOpsPayoutItem(input: unknown) {
  const parsed = fieldOpsPayoutItemMarkSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await markPayoutItemCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/payouts", "layout");
      revalidatePath("/field-ops/commissions", "layout");
      revalidatePath("/field-ops");
    }
    return res;
  } catch (e) {
    return adminError(e, "markFieldOpsPayoutItem");
  }
}

export async function cancelFieldOpsPayoutBatch(input: unknown) {
  const parsed = fieldOpsPayoutBatchRefSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await cancelPayoutBatchCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/payouts", "layout");
      revalidatePath("/field-ops/commissions", "layout");
    }
    return res;
  } catch (e) {
    return adminError(e, "cancelFieldOpsPayoutBatch");
  }
}

/** The finance CSV with full destinations — view_pii on top of .pay. */
export async function exportFieldOpsPayoutBatch(batchId: unknown) {
  if (typeof batchId !== "string") {
    return { status: 400, message: "Invalid batch" };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    return await exportPayoutBatchCsvCore(svc(), ctx, batchId);
  } catch (e) {
    return adminError(e, "exportFieldOpsPayoutBatch");
  }
}

/**
 * Takes a commission back (fieldops.commissions.approve + step-up). The
 * original row is never edited: a paid one gains a negative offset.
 */
export async function reverseFieldOpsCommission(input: unknown) {
  const parsed = fieldOpsAdminCommissionReverseSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await reverseCommissionAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/field-ops/commissions", "layout");
      revalidatePath("/field-ops");
    }
    return res;
  } catch (e) {
    return adminError(e, "reverseFieldOpsCommission");
  }
}
