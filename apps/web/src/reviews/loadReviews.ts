import "server-only";

import { publicSupabase } from "@/config/supabase/publicClient";
import {
  EMPTY_REVIEW_SUMMARY,
  REVIEW_PREVIEW_SIZE,
  type ReviewListRow,
  type ReviewPage,
  type ReviewSubjectKind,
  type ReviewSummary,
  formatReviewCount,
  parseSharedReviewId,
} from "@abonten/core/reviews/reviewList";
import {
  fetchReviewById,
  fetchReviewPage,
  fetchReviewSummary,
} from "@abonten/services/reviews/reviewListQuery";

// Server-side first data for the review surfaces on the (statically built,
// viewer-independent) event and place pages: the public summary, the
// preview or first page, and a shared review. Always the signed-out view —
// the client swaps in the visitor's own view (their votes, their blocks).

const EMPTY_PAGE: ReviewPage = { reviews: [], nextCursor: null };

export async function loadReviewPreview(
  kind: ReviewSubjectKind,
  subjectId: string,
): Promise<{ summary: ReviewSummary; reviews: ReviewListRow[] }> {
  const [summary, page] = await Promise.all([
    fetchReviewSummary(publicSupabase, kind, subjectId),
    fetchReviewPage(publicSupabase, {
      kind,
      subjectId,
      sort: "helpful",
      limit: REVIEW_PREVIEW_SIZE,
    }),
  ]);
  return {
    summary: summary.data ?? EMPTY_REVIEW_SUMMARY,
    reviews: page.data?.reviews ?? [],
  };
}

export async function loadReviewsPage(
  kind: ReviewSubjectKind,
  subjectId: string,
  reviewParam: string | string[] | undefined,
): Promise<{
  summary: ReviewSummary;
  page: ReviewPage;
  sharedReviewId: string | null;
  shared: ReviewListRow | null;
}> {
  const sharedReviewId = parseSharedReviewId(reviewParam);
  const [summary, page, shared] = await Promise.all([
    fetchReviewSummary(publicSupabase, kind, subjectId),
    fetchReviewPage(publicSupabase, { kind, subjectId, sort: "helpful" }),
    sharedReviewId
      ? fetchReviewById(publicSupabase, kind, subjectId, sharedReviewId)
      : Promise.resolve(null),
  ]);
  return {
    summary: summary.data ?? EMPTY_REVIEW_SUMMARY,
    page: page.data ?? EMPTY_PAGE,
    sharedReviewId,
    shared,
  };
}

/**
 * Link-preview text for a reviews page: the shared review itself when the
 * link points at one ("★★★★★ Great night — The sound was…"), otherwise the
 * rating summary.
 */
export async function reviewsPageDescription(
  kind: ReviewSubjectKind,
  subjectId: string,
  subjectTitle: string,
  reviewParam: string | string[] | undefined,
): Promise<string> {
  const reviewId = parseSharedReviewId(reviewParam);
  if (reviewId) {
    const review = await fetchReviewById(
      publicSupabase,
      kind,
      subjectId,
      reviewId,
    );
    if (review) {
      const stars = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
      const text = [review.title, review.comment].filter(Boolean).join(" — ");
      return `${stars} ${text || `A ${review.rating}-star review of ${subjectTitle}`}`.slice(
        0,
        200,
      );
    }
  }
  const summary = await fetchReviewSummary(publicSupabase, kind, subjectId);
  const s = summary.data ?? EMPTY_REVIEW_SUMMARY;
  return s.total > 0
    ? `Rated ${s.average.toFixed(1)} out of 5 from ${formatReviewCount(s.total)} on Abonten Hub.`
    : `Reviews of ${subjectTitle} on Abonten Hub.`;
}
