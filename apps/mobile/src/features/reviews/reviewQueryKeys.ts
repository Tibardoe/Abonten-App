import type { ReviewSubjectKind } from "@abonten/core/reviews/reviewList";
import type { QueryClient } from "@tanstack/react-query";

// Every review query for one event or place sits under
// ["mobile", "reviews", kind, subjectId, ...], so a new, edited or deleted
// review — or a block — refreshes the details preview, the rating
// breakdown, every filtered list and a shared-review card in one call.
// The persisted cache keeps the first page of each (queryPersistPolicy).

export const reviewKeys = {
  all: ["mobile", "reviews"] as const,
  subject: (kind: ReviewSubjectKind, subjectId: string | undefined) =>
    ["mobile", "reviews", kind, subjectId] as const,
  summary: (kind: ReviewSubjectKind, subjectId: string | undefined) =>
    ["mobile", "reviews", kind, subjectId, "summary"] as const,
  preview: (
    kind: ReviewSubjectKind,
    subjectId: string | undefined,
    viewerId: string | undefined,
  ) => ["mobile", "reviews", kind, subjectId, "preview", viewerId] as const,
  list: (
    kind: ReviewSubjectKind,
    subjectId: string | undefined,
    viewerId: string | undefined,
    filter: { rating: number | null; sort: string },
  ) =>
    [
      "mobile",
      "reviews",
      kind,
      subjectId,
      "list",
      viewerId,
      filter.rating,
      filter.sort,
    ] as const,
  shared: (
    kind: ReviewSubjectKind,
    subjectId: string | undefined,
    reviewId: string | null,
    viewerId: string | undefined,
  ) =>
    [
      "mobile",
      "reviews",
      kind,
      subjectId,
      "shared",
      reviewId,
      viewerId,
    ] as const,
};

/**
 * Refreshes everything that shows a subject's reviews or rating: the review
 * queries above, the detail screen (a place's detail carries its average),
 * the Explore / nearby cards (avg_rating) and the owner's management lists.
 * Leave `subjectId` out when only the review id is known.
 */
export function invalidateReviewSubject(
  qc: QueryClient,
  kind: ReviewSubjectKind,
  subjectId?: string,
): void {
  qc.invalidateQueries({
    queryKey: subjectId
      ? reviewKeys.subject(kind, subjectId)
      : ["mobile", "reviews", kind],
  });
  if (kind === "event") {
    qc.invalidateQueries({
      queryKey: subjectId
        ? ["organizer", "event-reviews", subjectId]
        : ["organizer", "event-reviews"],
    });
  } else {
    qc.invalidateQueries({
      queryKey: subjectId
        ? ["mobile", "place", subjectId]
        : ["mobile", "place"],
    });
    qc.invalidateQueries({
      queryKey: ["mobile", "organizer", "place-reviews"],
    });
    qc.invalidateQueries({ queryKey: ["discovery", "places"] });
  }
  qc.invalidateQueries({ queryKey: ["explore"] });
  qc.invalidateQueries({ queryKey: ["discovery"] });
}
