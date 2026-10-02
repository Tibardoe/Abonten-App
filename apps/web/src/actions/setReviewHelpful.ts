"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import type { ReviewSubjectKind } from "@abonten/core/reviews/reviewList";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type ReviewHelpfulResult,
  setReviewHelpfulCore,
} from "@abonten/services/reviews/reviewHelpfulCore";

// Mark / un-mark a review as helpful. Every rule (one vote per person, not
// your own review or your own listing, blocks, restricted accounts) is
// enforced by review_set_helpful in the database; mobile calls the same
// function directly.
export const setReviewHelpful = withActionLocale(
  async function setReviewHelpful(input: {
    kind: ReviewSubjectKind;
    reviewId: string;
    helpful: boolean;
  }): Promise<ReviewHelpfulResult> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: 401, message: tr("signInToMarkReviewsAs") };
    }
    return setReviewHelpfulCore(supabase, input);
  },
);
