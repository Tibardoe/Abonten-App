import type { ReviewListRow } from "./reviewList";

// Pure transforms over whatever shape a review query caches — one row, a
// preview array, a page ({ reviews }), React Query's infinite data
// ({ pages }), or a transport envelope ({ data }) around any of those — so
// an optimistic "helpful" tap or a block updates every list on screen at
// once, on web and mobile alike. Anything that isn't a review is returned
// untouched.

function isReviewRow(value: unknown): value is ReviewListRow {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as ReviewListRow).id === "string" &&
    typeof (value as ReviewListRow).helpfulCount === "number" &&
    typeof (value as ReviewListRow).reviewer === "object"
  );
}

function walk(
  node: unknown,
  onRow: (row: ReviewListRow) => ReviewListRow | null,
): unknown {
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    for (const item of node) {
      if (isReviewRow(item)) {
        const next = onRow(item);
        if (next) out.push(next);
      } else {
        out.push(walk(item, onRow));
      }
    }
    return out;
  }
  if (isReviewRow(node)) return onRow(node);
  if (!node || typeof node !== "object") return node;

  const obj = node as Record<string, unknown>;
  let changed: Record<string, unknown> | null = null;
  for (const key of ["pages", "reviews", "data"] as const) {
    if (key in obj) {
      changed = changed ?? { ...obj };
      changed[key] = walk(obj[key], onRow);
    }
  }
  return changed ?? node;
}

/** Applies `patch` to the review with this id wherever it appears. */
export function patchReviewInData<T>(
  data: T,
  reviewId: string,
  patch: (row: ReviewListRow) => ReviewListRow,
): T {
  return walk(data, (row) => (row.id === reviewId ? patch(row) : row)) as T;
}

/** Drops every review matching `drop` (a deleted review, a blocked reviewer). */
export function removeReviewsInData<T>(
  data: T,
  drop: (row: ReviewListRow) => boolean,
): T {
  return walk(data, (row) => (drop(row) ? null : row)) as T;
}

/** The optimistic result of tapping "Helpful" — the server's answer replaces it. */
export function withHelpfulVote(
  row: ReviewListRow,
  helpful: boolean,
): ReviewListRow {
  if (row.viewerFoundHelpful === helpful) return row;
  return {
    ...row,
    viewerFoundHelpful: helpful,
    helpfulCount: Math.max(0, row.helpfulCount + (helpful ? 1 : -1)),
  };
}
