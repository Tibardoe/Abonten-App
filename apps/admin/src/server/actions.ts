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
import {
  approveCreditAdjustmentCore,
  grantGoodwillCreditCore,
  rejectCreditAdjustmentCore,
  requestCreditAdjustmentCore,
  setCreditAccountStatusCore,
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
  reportAssignSchema,
  reportRequestInfoSchema,
  reportResolveSchema,
  reportStatusSchema,
  resendNotificationSchema,
  resolveReportGroupSchema,
  reviewClaimSchema,
  revokeAdminRoleSchema,
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
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
