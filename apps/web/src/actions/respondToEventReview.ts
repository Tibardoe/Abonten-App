"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { respondToEventReviewCore } from "@abonten/services/reviews/reviewResponseCore";

/**
 * Organizer reply to an event review — create OR edit. Thin wrapper: auth
 * here, the join-through-to-event ownership check + validation + update in
 * respondToEventReviewCore (shared with /api/mobile).
 */
export const respondToEventReview = withActionLocale(
  async function respondToEventReview(reviewId: string, response: string) {
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
    const result = await respondToEventReviewCore(
      supabase,
      user.id,
      reviewId,
      response,
      actor.error ? null : actor.accountId,
    );

    if (result.status === 200 && result.data?.eventCode) {
      revalidateAppPath(`/events/${result.data.eventCode.toLowerCase()}`);
    }

    return result;
  },
);
