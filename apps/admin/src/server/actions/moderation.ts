"use server";

import { currentRequestMeta, requireAdmin } from "@/lib/adminGuard";
import { applyModerationActionCore } from "@abonten/services/admin/moderation/applyModerationActionCore";
import { clearReviewResponseCore } from "@abonten/services/admin/moderation/clearReviewResponseCore";
import {
  clearReviewResponseSchema,
  moderationActionSchema,
} from "@abonten/validation/adminSchemas";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

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
