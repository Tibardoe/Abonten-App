"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import { captureAdminActionError } from "@/lib/sentry";
import { getServiceClient } from "@/lib/serviceClient";
import { createSsrClient } from "@/lib/supabaseServer";
import { cedisToCreditMinor } from "@abonten/core/rewards/creditAmount";
import { adminError as toAdminEnvelope } from "@abonten/services/admin/adminContext";
import { reviewClaimCore } from "@abonten/services/admin/claims/claimsAdminCore";
import {
  setCampaignStatusCore,
  upsertCampaignCore,
} from "@abonten/services/admin/fieldOps/campaignsAdminCore";
import { reverseCommissionAdminCore } from "@abonten/services/admin/fieldOps/commissionsAdminCore";
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
  clearPayoutReviewAdminCore,
  createPayoutAdminCore,
  refundTransactionAdminCore,
  sendPayoutAdminCore,
  settlePayoutAdminCore,
} from "@abonten/services/admin/finance/financeActionsCore";
import { applyModerationActionCore } from "@abonten/services/admin/moderation/applyModerationActionCore";
import { clearReviewResponseCore } from "@abonten/services/admin/moderation/clearReviewResponseCore";
import {
  broadcastNotificationCore,
  resendNotificationCore,
} from "@abonten/services/admin/notifications/notificationsAdminCore";
import {
  updateErrorGroupStatusCore,
  upsertIncidentCore,
} from "@abonten/services/admin/observability/observabilityCore";
import {
  addAdminNoteCore,
  assignReportCore,
  requestReportInfoCore,
  resolveReportCore,
  resolveReportGroupCore,
  updateReportStatusCore,
} from "@abonten/services/admin/reports/reportsAdminCore";
import { runMonthlyRebatesCore } from "@abonten/services/admin/rewards/rebateAdminCore";
import {
  decideHeldRewardCore,
  publishRewardRuleVersionCore,
  setRewardRuleActiveCore,
} from "@abonten/services/admin/rewards/referralAdminCore";
import {
  approveCreditAdjustmentCore,
  grantGoodwillCreditCore,
  rejectCreditAdjustmentCore,
  requestCreditAdjustmentCore,
  setCreditAccountStatusCore,
  setReferralCodeDisabledCore,
  updateRewardsSettingsCore,
} from "@abonten/services/admin/rewards/rewardsAdminCore";
import {
  grantAdminRoleCore,
  revokeAdminRoleCore,
  setAdminUserStatusCore,
  setRolePermissionCore,
} from "@abonten/services/admin/settings/adminSettingsCore";
import {
  assignSupportConversationCore,
  replySupportConversationCore,
  setSupportConversationStatusCore,
} from "@abonten/services/admin/support/supportAdminCore";
import { setUserStatusCore } from "@abonten/services/admin/users/usersAdminCore";
import {
  adminNoteSchema,
  adminRefundSchema,
  broadcastNotificationSchema,
  clearPayoutReviewSchema,
  clearReviewResponseSchema,
  createPayoutSchema,
  creditAccountStatusSchema,
  creditAdjustmentDecisionSchema,
  creditAdjustmentSchema,
  errorGroupStatusSchema,
  goodwillCreditSchema,
  grantAdminRoleSchema,
  incidentUpsertSchema,
  moderationActionSchema,
  rebateRunSchema,
  referralCodeDisabledSchema,
  reportAssignSchema,
  reportRequestInfoSchema,
  reportResolveSchema,
  reportStatusSchema,
  resendNotificationSchema,
  resolveReportGroupSchema,
  reviewClaimSchema,
  revokeAdminRoleSchema,
  rewardReviewSchema,
  rewardRuleActivationSchema,
  rewardRuleVersionSchema,
  rewardsSettingsSchema,
  sendPayoutSchema,
  setAdminUserStatusSchema,
  setRolePermissionSchema,
  setUserStatusSchema,
  settlePayoutSchema,
  supportAssignSchema,
  supportReplySchema,
  supportStatusSchema,
} from "@abonten/validation/adminSchemas";
import {
  fieldOpsAddMemberSchema,
  fieldOpsAdminCommissionReverseSchema,
  fieldOpsAdminFlagDecisionSchema,
  fieldOpsAdminOnboardingDecisionSchema,
  fieldOpsCampaignSchema,
  fieldOpsCampaignStatusChangeSchema,
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
  fieldOpsTerritorySchema,
} from "@abonten/validation/fieldOpsSchemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Held rewards: approve (release when due) or reject. rewards.review; no
// step-up -- it can only ever pay out a reward the engine already priced.
export async function decideHeldReward(input: unknown) {
  const parsed = rewardReviewSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await decideHeldRewardCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/rewards/queue");
      revalidatePath("/rewards/referrals");
    }
    return res;
  } catch (e) {
    return adminError(e, "decideHeldReward");
  }
}

// Rule versions change what the program pays: rewards.configure + step-up.
export async function publishRewardRuleVersion(input: unknown) {
  const parsed = rewardRuleVersionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await publishRewardRuleVersionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/rewards/rules");
    return res;
  } catch (e) {
    return adminError(e, "publishRewardRuleVersion");
  }
}

export async function setRewardRuleActive(input: unknown) {
  const parsed = rewardRuleActivationSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setRewardRuleActiveCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/rewards/rules");
      revalidatePath("/rewards");
    }
    return res;
  } catch (e) {
    return adminError(e, "setRewardRuleActive");
  }
}

// Runs the monthly rebates for a month by hand. It can post credit (when
// shadow mode is off), so rewards.configure + step-up, like rule changes.
export async function runMonthlyRebates(input: unknown) {
  const parsed = rebateRunSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await runMonthlyRebatesCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/rewards/rebates");
    return res;
  } catch (e) {
    return adminError(e, "runMonthlyRebates");
  }
}

const svc = () => getServiceClient();

// Every action catches its throw and returns a { status, message }
// envelope, so Next's onRequestError never sees the failure. Forward the
// genuinely unexpected ones (not the guard's expected 401/403) to the
// `abonten-admin` Sentry project before mapping to the envelope.
function adminError(e: unknown, action?: string) {
  captureAdminActionError(e, action);
  return toAdminEnvelope(e);
}

export async function signOut() {
  const supabase = await createSsrClient();
  await supabase.auth.signOut();
  redirect("/auth/signin");
}

// ── Reports ─────────────────────────────────────────────────

export async function assignReport(input: unknown) {
  const parsed = reportAssignSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await assignReportCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/reports/${parsed.data.reportId}`);
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function updateReportStatus(input: unknown) {
  const parsed = reportStatusSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await updateReportStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/reports/${parsed.data.reportId}`);
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function requestReportInfo(input: unknown) {
  const parsed = reportRequestInfoSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await requestReportInfoCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/reports/${parsed.data.reportId}`);
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function addAdminNote(input: unknown) {
  const parsed = adminNoteSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await addAdminNoteCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200 && parsed.data.targetType === "report") {
      revalidatePath(`/reports/${parsed.data.targetId}`);
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function resolveReport(input: unknown) {
  const parsed = reportResolveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await resolveReportCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/reports/${parsed.data.reportId}`);
      revalidatePath("/reports");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function resolveReportGroup(input: unknown) {
  const parsed = resolveReportGroupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await resolveReportGroupCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/reports");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// ── Moderation ──────────────────────────────────────────────

export async function applyModeration(input: unknown) {
  const parsed = moderationActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await applyModerationActionCore(
      svc(),
      ctx,
      {
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        action: parsed.data.action,
        reason: parsed.data.reason,
        reportId: parsed.data.reportId ?? null,
      },
      await currentRequestMeta(),
    );
    if (res.status === 200 && parsed.data.reportId) {
      revalidatePath(`/reports/${parsed.data.reportId}`);
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function clearReviewResponse(input: unknown) {
  const parsed = clearReviewResponseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await clearReviewResponseCore(
      svc(),
      ctx,
      {
        targetType: parsed.data.targetType,
        reviewId: parsed.data.reviewId,
        reason: parsed.data.reason,
      },
      await currentRequestMeta(),
    );
    if (res.status === 200 && parsed.data.reportId) {
      revalidatePath(`/reports/${parsed.data.reportId}`);
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// ── Claims ──────────────────────────────────────────────────

export async function reviewClaim(input: unknown) {
  const parsed = reviewClaimSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await reviewClaimCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/claims/${parsed.data.claimId}`);
      revalidatePath("/claims");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// ── Finance (money-path — step-up) ──────────────────────────

export async function refundTransaction(input: unknown) {
  const parsed = adminRefundSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await refundTransactionAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/finance/transactions/${parsed.data.transactionId}`);
      revalidatePath("/finance/refunds");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function settlePayout(input: unknown) {
  const parsed = settlePayoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await settlePayoutAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/finance/payouts");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function createPayout(input: unknown) {
  const parsed = createPayoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await createPayoutAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/finance/organizers/${parsed.data.organizerId}`);
      revalidatePath("/finance/payouts");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// Clear the credit-share review on a held payout (payout_credit_review).
export async function clearPayoutReview(input: unknown) {
  const parsed = clearPayoutReviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await clearPayoutReviewAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/finance/payouts/${parsed.data.payoutId}`);
      revalidatePath("/finance/payouts");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// Initiate a real Paystack transfer for an existing pending payout.
// No-op (409) unless PAYSTACK_TRANSFERS_ENABLED=true — see
// sendPayoutAdminCore. The payout settles via the transfer.* webhook.
export async function sendPayout(input: unknown) {
  const parsed = sendPayoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await sendPayoutAdminCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/finance/payouts/${parsed.data.payoutId}`);
      revalidatePath("/finance/payouts");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// ── Notifications ───────────────────────────────────────────

export async function resendNotification(input: unknown) {
  const parsed = resendNotificationSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await resendNotificationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/notifications/${parsed.data.id}`);
      revalidatePath("/notifications");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function broadcastNotification(input: unknown) {
  const parsed = broadcastNotificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await broadcastNotificationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/notifications");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// ── Users ───────────────────────────────────────────────────

export async function setUserStatus(input: unknown) {
  const parsed = setUserStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    if (parsed.data.status === "Banned") assertStepUpFresh(ctx);
    const res = await setUserStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/users/${parsed.data.userId}`);
      revalidatePath("/users");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// ── Monitoring ──────────────────────────────────────────────

export async function setErrorGroupStatus(input: unknown) {
  const parsed = errorGroupStatusSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await updateErrorGroupStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/monitoring");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function upsertIncident(input: unknown) {
  const parsed = incidentUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await upsertIncidentCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/monitoring");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// ── Settings (step-up) ──────────────────────────────────────

export async function grantAdminRole(input: unknown) {
  const parsed = grantAdminRoleSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await grantAdminRoleCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/settings");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function revokeAdminRole(input: unknown) {
  const parsed = revokeAdminRoleSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await revokeAdminRoleCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/settings");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function setAdminUserStatus(input: unknown) {
  const parsed = setAdminUserStatusSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setAdminUserStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/settings");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function setRolePermission(input: unknown) {
  const parsed = setRolePermissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await setRolePermissionCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/settings");
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// ── In-app support queue ────────────────────────────────────

export async function assignSupportConversation(input: unknown) {
  const parsed = supportAssignSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await assignSupportConversationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/support/${parsed.data.conversationId}`);
      revalidatePath("/support");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function replySupportConversation(input: unknown) {
  const parsed = supportReplySchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await replySupportConversationCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/support/${parsed.data.conversationId}`);
      revalidatePath("/support");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function setSupportConversationStatus(input: unknown) {
  const parsed = supportStatusSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await setSupportConversationStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/support/${parsed.data.conversationId}`);
      revalidatePath("/support");
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

export async function addSupportNote(input: unknown) {
  const parsed = adminNoteSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid input" };
  if (parsed.data.targetType !== "support_conversation") {
    return { status: 400, message: "Invalid input" };
  }
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await addAdminNoteCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/support/${parsed.data.targetId}`);
    }
    return res;
  } catch (e) {
    return adminError(e);
  }
}

// ── Rewards (Abonten Credit) ────────────────────────────────
// Credit only moves through the credit_* database functions; these actions
// validate, re-check the admin (+ step-up for adjustments and settings) and
// delegate to @abonten/services/admin/rewards.

function firstIssue(error: { issues: { message: string }[] }) {
  return { status: 400, message: error.issues[0]?.message ?? "Invalid input" };
}

export async function requestCreditAdjustment(input: unknown) {
  const parsed = creditAdjustmentSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const d = parsed.data;
    const res = await requestCreditAdjustmentCore(
      svc(),
      ctx,
      {
        userId: d.userId,
        direction: d.direction,
        amountMinor: cedisToCreditMinor(d.amount),
        reason: d.reason,
        userLabel: d.userLabel || null,
        spendScope: d.spendScope,
        expiresAt: d.expiresInDays
          ? new Date(Date.now() + d.expiresInDays * 86_400_000).toISOString()
          : null,
        allowNegative: d.allowNegative,
      },
      await currentRequestMeta(),
    );
    if (res.status === 200 || res.status === 202) {
      revalidatePath(`/rewards/accounts/${d.userId}`);
      revalidatePath("/rewards");
    }
    return res;
  } catch (e) {
    return adminError(e, "requestCreditAdjustment");
  }
}

export async function decideCreditAdjustment(input: unknown) {
  const parsed = creditAdjustmentDecisionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const meta = await currentRequestMeta();
    const res =
      parsed.data.decision === "approve"
        ? await approveCreditAdjustmentCore(
            svc(),
            ctx,
            { requestId: parsed.data.requestId, note: parsed.data.note },
            meta,
          )
        : await rejectCreditAdjustmentCore(
            svc(),
            ctx,
            { requestId: parsed.data.requestId, note: parsed.data.note ?? "" },
            meta,
          );
    if (res.status === 200) {
      revalidatePath("/rewards");
      revalidatePath("/rewards/accounts", "layout");
    }
    return res;
  } catch (e) {
    return adminError(e, "decideCreditAdjustment");
  }
}

export async function grantGoodwillCredit(input: unknown) {
  const parsed = goodwillCreditSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await grantGoodwillCreditCore(
      svc(),
      ctx,
      {
        userId: parsed.data.userId,
        amountMinor: cedisToCreditMinor(parsed.data.amount),
        reason: parsed.data.reason,
        requestId: parsed.data.requestId,
      },
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/rewards/accounts/${parsed.data.userId}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "grantGoodwillCredit");
  }
}

export async function setCreditAccountStatus(input: unknown) {
  const parsed = creditAccountStatusSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await setCreditAccountStatusCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/rewards/accounts/${parsed.data.userId}`);
      revalidatePath("/rewards/accounts");
    }
    return res;
  } catch (e) {
    return adminError(e, "setCreditAccountStatus");
  }
}

// Turn a user's referral code off (spam / a reported farm) or back on.
export async function setReferralCodeDisabled(input: unknown) {
  const parsed = referralCodeDisabledSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await setReferralCodeDisabledCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath(`/rewards/accounts/${parsed.data.userId}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "setReferralCodeDisabled");
  }
}

export async function updateRewardsSettings(input: unknown) {
  const parsed = rewardsSettingsSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    assertStepUpFresh(ctx);
    const res = await updateRewardsSettingsCore(
      svc(),
      ctx,
      parsed.data,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/rewards");
      revalidatePath("/rewards/settings");
    }
    return res;
  } catch (e) {
    return adminError(e, "updateRewardsSettings");
  }
}

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
