"use server";

import { createClient } from "@/config/supabase/server";
import type {
  ReviewCursor,
  ReviewPage,
  ReviewRatingFilter,
  ReviewSort,
  ReviewSubjectKind,
} from "@abonten/core/reviews/reviewList";
import { fetchReviewPage } from "@abonten/services/reviews/reviewListQuery";

// One page of an event's or place's public reviews — star filter, "most
// helpful" / "most recent", keyset cursor. Uses the visitor's own session
// (when there is one) so the page knows which reviews they marked helpful
// and leaves out people they blocked; signed out, it's the public list.
export async function getReviewPage(input: {
  kind: ReviewSubjectKind;
  subjectId: string;
  rating?: ReviewRatingFilter;
  sort?: ReviewSort;
  cursor?: ReviewCursor | null;
  limit?: number;
}): Promise<{ status: number; message?: string; data?: ReviewPage }> {
  const supabase = await createClient();
  return fetchReviewPage(supabase, {
    kind: input.kind,
    subjectId: input.subjectId,
    rating: input.rating ?? null,
    sort: input.sort ?? "helpful",
    cursor: input.cursor ?? null,
    limit: input.limit,
  });
}
