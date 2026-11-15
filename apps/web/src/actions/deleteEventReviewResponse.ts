"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { deleteEventReviewResponseCore } from "@abonten/services/reviews/reviewResponseCore";

/**
 * Organizer-only removal of their reply to an event review. Thin wrapper:
 * auth here, ownership check + null-out in deleteEventReviewResponseCore
 * (shared with /api/mobile). Idempotent.
 */
export const deleteEventReviewResponse = withActionLocale(
  async function deleteEventReviewResponse(reviewId: string) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { status: 401, message: tr("userNotAuthenticated") };
    }

    // Managing as a team that answers reviews: its reply.
    const actor = await actingFor(user.id, "reviews.reply");
    const result = await deleteEventReviewResponseCore(
      supabase,
      user.id,
      reviewId,
      actor.error ? null : actor.accountId,
    );

    if (result.status === 200 && result.data?.eventCode) {
      revalidateAppPath(`/events/${result.data.eventCode.toLowerCase()}`);
    }

    return result;
  },
);
