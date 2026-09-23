import { logger } from "@abonten/core/logger";
import type { ReviewSubjectKind } from "@abonten/core/reviews/reviewList";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Marks (or un-marks) a review as helpful for the signed-in caller.
//
// Every rule lives in review_set_helpful() (migration 20260923090000) and is
// enforced by the database, not here: one vote per person per review (the
// vote table's primary key), the review must be public, you can't vote on
// your own review or on reviews of your own event/place, blocked pairs
// can't vote on each other, and a restricted account can't vote. This
// wrapper only turns the database's refusal into an envelope. Mobile calls
// the same function directly (it is auth.uid()-scoped, granted to
// `authenticated` only), so there is no separate mobile route.

export type ReviewHelpfulResult = {
  status: 200 | 400 | 401 | 403 | 404 | 500;
  message?: string;
  data?: { helpfulCount: number; viewerFoundHelpful: boolean };
};

export async function setReviewHelpfulCore(
  supabase: SupabaseClient<Database>,
  input: { kind: ReviewSubjectKind; reviewId: string; helpful: boolean },
): Promise<ReviewHelpfulResult> {
  if (input.kind !== "event" && input.kind !== "place") {
    return { status: 400, message: "Unknown review." };
  }
  const { data, error } = await supabase
    .rpc("review_set_helpful", {
      p_review_kind: input.kind,
      p_review_id: input.reviewId,
      p_helpful: input.helpful,
    })
    .maybeSingle();

  if (error) {
    switch (error.code) {
      case "42501":
        return { status: 403, message: error.message };
      case "P0002":
        return { status: 404, message: error.message };
      case "23514":
      case "22023":
      case "22P02":
        return { status: 400, message: error.message };
      default:
        logger.error(`review_set_helpful failed: ${error.message}`);
        return { status: 500, message: "Couldn't save that. Try again." };
    }
  }

  const row = data as {
    helpful_count: number;
    viewer_found_helpful: boolean;
  } | null;
  return {
    status: 200,
    data: {
      helpfulCount: Number(row?.helpful_count ?? 0),
      viewerFoundHelpful: !!row?.viewer_found_helpful,
    },
  };
}
