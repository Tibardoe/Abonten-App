import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Moderator action: remove the organizer/owner *reply* on a review without
// touching the review itself (unlike apply_moderation_action, which hides
// or removes the whole review row). Used when a reply — not the review — is
// what's abusive. Service-role write: the caller is a resolved AdminContext,
// so RLS + the review column-guard trigger (which key off auth.uid()) don't
// apply; authorization is the `moderation.remove` permission check here.

type ReviewTargetType = "event_review" | "place_review";

const RESPONSE_COLS: Record<
  ReviewTargetType,
  { text: "organizer_response" | "owner_response"; at: string }
> = {
  event_review: {
    text: "organizer_response",
    at: "organizer_response_at",
  },
  place_review: { text: "owner_response", at: "owner_response_at" },
};

export async function clearReviewResponseCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { targetType: ReviewTargetType; reviewId: string; reason?: string },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<{ cleared: boolean }>> {
  try {
    assertPermission(ctx, "moderation.remove");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const cols = RESPONSE_COLS[input.targetType];

  const { data: before, error: readError } = await supabase
    .from(input.targetType as keyof Database["public"]["Tables"])
    .select(`id, ${cols.text}, ${cols.at}`)
    .eq("id" as never, input.reviewId)
    .maybeSingle();

  if (readError) {
    logger.error(`clearReviewResponseCore read failed: ${readError.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!before) {
    return { status: 404, message: "Review not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: dynamic column name off a runtime targetType
  const previous = (before as any)[cols.text] as string | null;

  if (!previous) {
    // Nothing to do — idempotent.
    return {
      status: 200,
      message: "No reply to remove.",
      data: { cleared: false },
    };
  }

  const { error: updateError } = await supabase
    .from(input.targetType as keyof Database["public"]["Tables"])
    .update({ [cols.text]: null, [cols.at]: null } as never)
    .eq("id" as never, input.reviewId);

  if (updateError) {
    logger.error(
      `clearReviewResponseCore update failed: ${updateError.message}`,
    );
    return { status: 500, message: "Something went wrong" };
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "moderation.clear_review_response",
    targetType: input.targetType,
    targetId: input.reviewId,
    summary: `Cleared ${cols.text} on ${input.targetType}`,
    reason: input.reason ?? null,
    before: { [cols.text]: previous },
    after: { [cols.text]: null },
    requestMeta: requestMeta ?? null,
  });

  return {
    status: 200,
    message: "Reply removed.",
    data: { cleared: true },
  };
}
