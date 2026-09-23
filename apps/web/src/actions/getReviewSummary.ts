"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import type {
  ReviewSubjectKind,
  ReviewSummary,
} from "@abonten/core/reviews/reviewList";
import { fetchReviewSummary } from "@abonten/services/reviews/reviewListQuery";

// Average, total and 1–5 star counts for an event or place — the same for
// every visitor, so it's read without a session.
export async function getReviewSummary(
  kind: ReviewSubjectKind,
  subjectId: string,
): Promise<{ status: number; message?: string; data?: ReviewSummary }> {
  return fetchReviewSummary(publicSupabase, kind, subjectId);
}
