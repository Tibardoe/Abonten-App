import { logger } from "@abonten/core/logger";
import {
  EMPTY_REVIEW_SUMMARY,
  REVIEW_PAGE_SIZE,
  type ReviewListRow,
  type ReviewListRpcRow,
  type ReviewPage,
  type ReviewPageQuery,
  type ReviewSubjectKind,
  type ReviewSummary,
  type ReviewSummaryRpcRow,
  parseReviewRow,
  parseReviewSummary,
  reviewByIdArgs,
  reviewListArgs,
  toReviewPage,
} from "@abonten/core/reviews/reviewList";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Web's read path for event and place reviews: the rating breakdown and the
// paged list (review_summary / review_list, migration 20260923090000).
// Mobile makes the same two calls straight to Supabase — both functions are
// SECURITY INVOKER — and turns rows into screens with the same
// @abonten/core/reviews/reviewList helpers, so the platforms can't drift.
//
// Pass the caller's own client (cookie session on web). review_list uses
// auth.uid() for the viewer's helpful votes and to leave out reviews by
// people they blocked; a service-role client would see neither.

type Envelope<T> = { status: 200 | 400 | 500; message?: string; data?: T };

export async function fetchReviewSummary(
  supabase: SupabaseClient<Database>,
  kind: ReviewSubjectKind,
  subjectId: string,
): Promise<Envelope<ReviewSummary>> {
  const { data, error } = await supabase
    .rpc("review_summary", {
      p_subject_kind: kind,
      p_subject_id: subjectId,
    })
    .maybeSingle();
  if (error) {
    logger.error(`review_summary failed: ${error.message}`);
    return {
      status: 500,
      message: "Couldn't load ratings.",
      data: EMPTY_REVIEW_SUMMARY,
    };
  }
  return {
    status: 200,
    data: parseReviewSummary(data as ReviewSummaryRpcRow | null),
  };
}

export async function fetchReviewPage(
  supabase: SupabaseClient<Database>,
  query: ReviewPageQuery,
): Promise<Envelope<ReviewPage>> {
  const limit = Math.min(Math.max(query.limit ?? REVIEW_PAGE_SIZE, 1), 49);
  const { data, error } = await supabase.rpc(
    "review_list",
    reviewListArgs({ ...query, limit }) as never,
  );
  if (error) {
    // 22023 = a bad kind / sort / rating filter reached the function.
    if (error.code === "22023") {
      return { status: 400, message: error.message };
    }
    logger.error(`review_list failed: ${error.message}`);
    return { status: 500, message: "Couldn't load reviews." };
  }
  return {
    status: 200,
    data: toReviewPage(data as unknown as ReviewListRpcRow[], limit),
  };
}

/** One public review of a subject — what a shared review link opens on. Null when it's gone, hidden, or by someone the viewer blocked. */
export async function fetchReviewById(
  supabase: SupabaseClient<Database>,
  kind: ReviewSubjectKind,
  subjectId: string,
  reviewId: string,
): Promise<ReviewListRow | null> {
  const { data, error } = await supabase.rpc(
    "review_list",
    reviewByIdArgs(kind, subjectId, reviewId) as never,
  );
  if (error) {
    logger.error(`review_list (by id) failed: ${error.message}`);
    return null;
  }
  const row = (data as unknown as ReviewListRpcRow[] | null)?.[0];
  return row ? parseReviewRow(row) : null;
}
