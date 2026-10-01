"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import type {
  ReviewListRow,
  ReviewSubjectKind,
} from "@abonten/core/reviews/reviewList";
import { fetchReviewById } from "@abonten/services/reviews/reviewListQuery";

// The review a shared link (?review=<id>) points at, as this visitor may see
// it — null when it has been deleted, hidden, or is by someone they blocked.
export const getSharedReview = withActionLocale(async function getSharedReview(
  kind: ReviewSubjectKind,
  subjectId: string,
  reviewId: string,
): Promise<ReviewListRow | null> {
  const supabase = await createClient();
  return fetchReviewById(supabase, kind, subjectId, reviewId);
});
