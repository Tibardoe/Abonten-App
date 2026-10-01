"use server";

import { createClient } from "@/config/supabase/server";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { respondToEventReviewCore } from "@abonten/services/reviews/reviewResponseCore";

/**
 * Organizer reply to an event review — create OR edit. Thin wrapper: auth
 * here, the join-through-to-event ownership check + validation + update in
 * respondToEventReviewCore (shared with /api/mobile).
 */
export async function respondToEventReview(reviewId: string, response: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const result = await respondToEventReviewCore(
    supabase,
    user.id,
    reviewId,
    response,
  );

  if (result.status === 200 && result.data?.eventCode) {
    revalidateAppPath(`/events/${result.data.eventCode.toLowerCase()}`);
  }

  return result;
}
