"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import { getServiceClient } from "@/lib/serviceClient";
import { createSsrClient } from "@/lib/supabaseServer";
import { adminError } from "@abonten/services/admin/adminContext";
import { reviewClaimCore } from "@abonten/services/admin/claims/claimsAdminCore";
import {
  createPayoutAdminCore,
  refundTransactionAdminCore,
  settlePayoutAdminCore,
} from "@abonten/services/admin/finance/financeActionsCore";
import { applyModerationActionCore } from "@abonten/services/admin/moderation/applyModerationActionCore";
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
  grantAdminRoleCore,
  revokeAdminRoleCore,
  setAdminUserStatusCore,
  setRolePermissionCore,
} from "@abonten/services/admin/settings/adminSettingsCore";
import { setUserStatusCore } from "@abonten/services/admin/users/usersAdminCore";
import {
  adminNoteSchema,
  adminRefundSchema,
  broadcastNotificationSchema,
  createPayoutSchema,
  errorGroupStatusSchema,
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
  setAdminUserStatusSchema,
  setRolePermissionSchema,
  setUserStatusSchema,
  settlePayoutSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const svc = () => getServiceClient();

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
