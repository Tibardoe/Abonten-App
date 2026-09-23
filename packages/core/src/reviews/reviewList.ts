// The shared vocabulary for event and place reviews: the list row, the
// rating breakdown, the paging cursor, and the links a review is shared by.
//
// Both platforms read reviews through the same two Postgres functions
// (review_list / review_summary, migration 20260923090000). Web goes through
// @abonten/services; mobile calls them directly (RLS-safe class-A reads,
// SECURITY INVOKER). Everything either side needs to turn a row into what
// the screen shows lives here so the two can't drift.

export type ReviewSubjectKind = "event" | "place";

/** "Most helpful" ties fall back to newest first, so with no votes yet it reads as "most recent". */
export type ReviewSort = "helpful" | "recent";

export const REVIEW_SORTS: { value: ReviewSort; label: string }[] = [
  { value: "helpful", label: "Most helpful" },
  { value: "recent", label: "Most recent" },
];

export type ReviewRatingFilter = 1 | 2 | 3 | 4 | 5 | null;

/** Reviews per page on the full reviews screen. */
export const REVIEW_PAGE_SIZE = 10;
/** Reviews shown on an event or place details screen before "See all". */
export const REVIEW_PREVIEW_SIZE = 3;

export type ReviewPhoto = {
  id: string;
  public_id: string;
  version: string;
  position: number;
};

export type ReviewListRow = {
  id: string;
  subjectId: string;
  reviewerId: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  editedAt: string | null;
  helpfulCount: number;
  viewerFoundHelpful: boolean;
  /** Event reviews only: the reviewer's ticket was checked in. Null for places. */
  isVerifiedAttendee: boolean | null;
  /** The organizer's (event) or owner's (place) public reply. */
  response: string | null;
  responseAt: string | null;
  reviewer: {
    username: string | null;
    fullName: string | null;
    avatarPublicId: string | null;
    avatarVersion: string | null;
    /** The account was deleted; its name is a placeholder and it has no profile. */
    deleted: boolean;
  };
  photos: ReviewPhoto[];
};

/** Exactly what review_list returns (snake_case, as PostgREST sends it). */
export type ReviewListRpcRow = {
  id: string;
  subject_id: string;
  reviewer_id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  created_at: string;
  edited_at: string | null;
  helpful_count: number;
  viewer_found_helpful: boolean;
  is_verified_attendee: boolean | null;
  response: string | null;
  response_at: string | null;
  reviewer_username: string | null;
  reviewer_full_name: string | null;
  reviewer_avatar_public_id: string | null;
  reviewer_avatar_version: string | null;
  reviewer_deleted: boolean;
  photos: unknown;
};

function parsePhotos(value: unknown): ReviewPhoto[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (p): p is ReviewPhoto =>
        !!p &&
        typeof p === "object" &&
        typeof (p as ReviewPhoto).public_id === "string" &&
        typeof (p as ReviewPhoto).version === "string",
    )
    .sort((a, b) => a.position - b.position);
}

export function parseReviewRow(row: ReviewListRpcRow): ReviewListRow {
  return {
    id: row.id,
    subjectId: row.subject_id,
    reviewerId: row.reviewer_id,
    rating: Number(row.rating),
    title: row.title,
    comment: row.comment,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    helpfulCount: Number(row.helpful_count ?? 0),
    viewerFoundHelpful: !!row.viewer_found_helpful,
    isVerifiedAttendee: row.is_verified_attendee,
    response: row.response,
    responseAt: row.response_at,
    reviewer: {
      username: row.reviewer_deleted ? null : row.reviewer_username,
      fullName: row.reviewer_deleted ? null : row.reviewer_full_name,
      avatarPublicId: row.reviewer_deleted
        ? null
        : row.reviewer_avatar_public_id,
      avatarVersion: row.reviewer_deleted ? null : row.reviewer_avatar_version,
      deleted: !!row.reviewer_deleted,
    },
    photos: parsePhotos(row.photos),
  };
}

/** The name a review is shown under. */
export function reviewerDisplayName(
  reviewer: ReviewListRow["reviewer"],
  kind: ReviewSubjectKind,
): string {
  if (reviewer.deleted) return "Former Abonten member";
  return reviewer.username ?? (kind === "event" ? "Attendee" : "Guest");
}

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

/** Where the next page starts. Opaque to the screen; passed straight back. */
export type ReviewCursor = {
  helpful: number;
  createdAt: string;
  id: string;
};

export function reviewCursorAfter(row: ReviewListRow): ReviewCursor {
  return { helpful: row.helpfulCount, createdAt: row.createdAt, id: row.id };
}

export type ReviewPageQuery = {
  kind: ReviewSubjectKind;
  subjectId: string;
  rating?: ReviewRatingFilter;
  sort?: ReviewSort;
  cursor?: ReviewCursor | null;
  limit?: number;
  /** Leave the viewer's own review out (it is shown in its own block). */
  excludeViewer?: boolean;
};

/** The review_list arguments for a page. Unset optional args are sent as null — PostgREST drops `undefined` keys and would then fail to match the function. */
export function reviewListArgs(q: ReviewPageQuery) {
  return {
    p_subject_kind: q.kind,
    p_subject_id: q.subjectId,
    p_rating: q.rating ?? null,
    p_sort: q.sort ?? "helpful",
    p_after_helpful: q.cursor ? q.cursor.helpful : null,
    p_after_created: q.cursor ? q.cursor.createdAt : null,
    p_after_id: q.cursor ? q.cursor.id : null,
    // One extra row tells us whether another page exists, without a count.
    p_limit: (q.limit ?? REVIEW_PAGE_SIZE) + 1,
    p_review_id: null,
    p_exclude_viewer: q.excludeViewer ?? false,
  };
}

/** The review_list arguments that fetch one review by id (a shared link). */
export function reviewByIdArgs(
  kind: ReviewSubjectKind,
  subjectId: string,
  reviewId: string,
) {
  return {
    p_subject_kind: kind,
    p_subject_id: subjectId,
    p_rating: null,
    p_sort: "recent",
    p_after_helpful: null,
    p_after_created: null,
    p_after_id: null,
    p_limit: 1,
    p_review_id: reviewId,
    p_exclude_viewer: false,
  };
}

export type ReviewPage = {
  reviews: ReviewListRow[];
  nextCursor: ReviewCursor | null;
};

export function toReviewPage(
  rows: ReviewListRpcRow[] | null | undefined,
  limit: number = REVIEW_PAGE_SIZE,
): ReviewPage {
  const parsed = (rows ?? []).map(parseReviewRow);
  const hasNext = parsed.length > limit;
  const reviews = hasNext ? parsed.slice(0, limit) : parsed;
  const last = reviews[reviews.length - 1];
  return {
    reviews,
    nextCursor: hasNext && last ? reviewCursorAfter(last) : null,
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type ReviewSummary = {
  /** Unrounded mean; 0 when there are no reviews. */
  average: number;
  total: number;
  /** counts[5] is the number of 5-star reviews, and so on. */
  counts: Record<1 | 2 | 3 | 4 | 5, number>;
};

export const EMPTY_REVIEW_SUMMARY: ReviewSummary = {
  average: 0,
  total: 0,
  counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

export type ReviewSummaryRpcRow = {
  average_rating: number | string | null;
  total_ratings: number | null;
  count_1: number | null;
  count_2: number | null;
  count_3: number | null;
  count_4: number | null;
  count_5: number | null;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function parseReviewSummary(
  row: ReviewSummaryRpcRow | null | undefined,
): ReviewSummary {
  if (!row) return EMPTY_REVIEW_SUMMARY;
  return {
    average: num(row.average_rating),
    total: num(row.total_ratings),
    counts: {
      1: num(row.count_1),
      2: num(row.count_2),
      3: num(row.count_3),
      4: num(row.count_4),
      5: num(row.count_5),
    },
  };
}

/**
 * Each star level's share of all reviews, as whole percentages that add up
 * to 100 (largest-remainder rounding — plain rounding can show 99% or 101%).
 */
export function ratingShares(
  summary: ReviewSummary,
): Record<1 | 2 | 3 | 4 | 5, number> {
  const levels = [5, 4, 3, 2, 1] as const;
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (summary.total <= 0) return out;
  const exact = levels.map((s) => ({
    star: s,
    value: (summary.counts[s] / summary.total) * 100,
  }));
  let assigned = 0;
  for (const e of exact) {
    out[e.star] = Math.floor(e.value);
    assigned += out[e.star];
  }
  const byRemainder = [...exact].sort(
    (a, b) => (b.value % 1) - (a.value % 1) || b.star - a.star,
  );
  for (let i = 0; i < 100 - assigned && i < byRemainder.length; i++) {
    const star = byRemainder[i]?.star;
    if (star) out[star] += 1;
  }
  return out;
}

export function formatReviewCount(total: number): string {
  return `${total.toLocaleString("en-US")} ${total === 1 ? "review" : "reviews"}`;
}

/** Empty-list wording for a star filter or no filter. */
export function emptyReviewsMessage(
  rating: ReviewRatingFilter,
  kind: ReviewSubjectKind,
): { title: string; description: string } {
  if (rating) {
    return {
      title: `No ${rating}-star reviews yet`,
      description: "Try another rating, or show all reviews.",
    };
  }
  return {
    title: "No reviews yet",
    description:
      kind === "event"
        ? "People who attended can review this event once it has ended."
        : "Be the first to share what this place is like.",
  };
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * The site path of a subject's reviews page, optionally opened on one
 * review. `slug` is the event's code slug or the place's slug — the same
 * segment its details page uses.
 */
export function reviewsPath(
  kind: ReviewSubjectKind,
  slug: string,
  reviewId?: string | null,
): string {
  const base = `/${kind === "event" ? "events" : "places"}/${encodeURIComponent(slug)}/reviews`;
  return reviewId ? `${base}?review=${encodeURIComponent(reviewId)}` : base;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A `?review=` value is only ever a review id; anything else is ignored. */
export function parseSharedReviewId(
  value: string | string[] | null | undefined,
): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && UUID.test(v) ? v : null;
}
