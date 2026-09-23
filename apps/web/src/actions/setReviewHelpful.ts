"use server";

import { createClient } from "@/config/supabase/server";
import type { ReviewSubjectKind } from "@abonten/core/reviews/reviewList";
import {
  type ReviewHelpfulResult,
  setReviewHelpfulCore,
} from "@abonten/services/reviews/reviewHelpfulCore";

// Mark / un-mark a review as helpful. Every rule (one vote per person, not
// your own review or your own listing, blocks, restricted accounts) is
// enforced by review_set_helpful in the database; mobile calls the same
// function directly.
export async function setReviewHelpful(input: {
  kind: ReviewSubjectKind;
  reviewId: string;
  helpful: boolean;
}): Promise<ReviewHelpfulResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: 401, message: "Sign in to mark reviews as helpful." };
  }
  return setReviewHelpfulCore(supabase, input);
}
