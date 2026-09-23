"use client";

import InfiniteScrollStatus from "@/components/molecules/InfiniteScrollStatus";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import ReviewListItem from "@/components/molecules/ReviewListItem";
import ReviewRowSkeleton from "@/components/molecules/ReviewRowSkeleton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import {
  REVIEW_SORTS,
  type ReviewListRow,
  type ReviewPage,
  type ReviewRatingFilter,
  type ReviewSort,
  type ReviewSummary,
  emptyReviewsMessage,
} from "@abonten/core/reviews/reviewList";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import OrganizerReplyControls from "../molecules/OrganizerReplyControls";
import ReviewItemActions from "../molecules/ReviewItemActions";
import ReviewSummaryBars from "../molecules/ReviewSummaryBars";
import {
  useReviewList,
  useReviewSummary,
  useSharedReview,
} from "../useReviewQueries";
import type { ReviewsSubject } from "./ReviewsPreview";

// Every review of one event or place: the breakdown (each row filters), your
// own review controls, a star filter, "Most helpful" / "Most recent", and an
// infinite list fetched ten at a time with keyset cursors, so a filter holds
// on every page and nothing repeats as new reviews arrive. A shared link
// (?review=<id>) pins that review at the top.

const RATING_FILTERS: { value: ReviewRatingFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: 5, label: "5 ★" },
  { value: 4, label: "4 ★" },
  { value: 3, label: "3 ★" },
  { value: 2, label: "2 ★" },
  { value: 1, label: "1 ★" },
];

const SKELETON_KEYS = ["a", "b", "c"];

export default function ReviewsBrowser({
  subject,
  initialSummary,
  initialPage,
  sharedReviewId,
  initialShared,
  addReviewButton,
}: {
  subject: ReviewsSubject;
  initialSummary: ReviewSummary;
  initialPage: ReviewPage;
  sharedReviewId: string | null;
  initialShared: ReviewListRow | null;
  addReviewButton: ReactNode;
}) {
  const { data: user } = useCurrentUser();
  const viewerId = user?.id ?? null;
  const [rating, setRating] = useState<ReviewRatingFilter>(null);
  const [sort, setSort] = useState<ReviewSort>("helpful");

  const summary = useReviewSummary(subject.kind, subject.id, initialSummary);
  const list = useReviewList(
    subject.kind,
    subject.id,
    { rating, sort },
    initialPage,
  );
  const shared = useSharedReview(
    subject.kind,
    subject.id,
    sharedReviewId,
    initialShared,
  );

  const sharedRow = shared.data ?? null;
  const rows = (list.data?.pages.flatMap((p) => p.reviews) ?? []).filter(
    (r) => r.id !== sharedRow?.id,
  );
  const total = summary.data?.total ?? 0;
  const empty = emptyReviewsMessage(rating, subject.kind);
  const isOrganizer =
    subject.kind === "event" && !!viewerId && viewerId === subject.ownerId;

  // Bring a shared review into view once it's on the page.
  useEffect(() => {
    if (!sharedRow) return;
    document
      .getElementById(`review-${sharedRow.id}`)
      ?.scrollIntoView({ block: "start" });
  }, [sharedRow]);

  const onIntersect = useCallback(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [list]);
  const sentinelRef = useInfiniteScrollSentinel({
    onIntersect,
    enabled:
      !!list.hasNextPage &&
      !list.isFetchingNextPage &&
      !list.isFetchNextPageError,
  });

  const renderReview = (review: ReviewListRow, highlighted = false) => (
    <ReviewListItem
      key={review.id}
      review={review}
      kind={subject.kind}
      highlighted={highlighted}
      isOwn={viewerId === review.reviewerId}
      actions={
        <ReviewItemActions
          review={review}
          kind={subject.kind}
          subjectSlug={subject.slug}
          subjectTitle={subject.title}
          viewerId={viewerId}
          ownerId={subject.ownerId}
        />
      }
    >
      {isOrganizer ? (
        <OrganizerReplyControls review={review} eventId={subject.id} />
      ) : null}
    </ReviewListItem>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          {summary.data && total > 0 ? (
            <ReviewSummaryBars
              summary={summary.data}
              selected={rating}
              onSelect={setRating}
            />
          ) : null}
        </div>
        <div className="w-full md:w-auto">{addReviewButton}</div>
      </div>

      {sharedReviewId && shared.isSuccess && !sharedRow ? (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          The review you opened is no longer available.
        </p>
      ) : null}
      {sharedRow ? (
        <ul aria-label="Shared review">{renderReview(sharedRow, true)}</ul>
      ) : null}

      {total > 0 ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Filter by rating</legend>
            {RATING_FILTERS.map((f) => {
              const active = rating === f.value;
              return (
                <button
                  key={f.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRating(f.value)}
                  className={`rounded-full px-3.5 py-1.5 text-sm ${
                    active
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "border border-border bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {f.value && summary.data
                    ? `${f.label} · ${summary.data.counts[f.value].toLocaleString("en-US")}`
                    : f.label}
                </button>
              );
            })}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sort by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ReviewSort)}
              className="rounded-md border border-input bg-background px-2 py-1.5"
            >
              {REVIEW_SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {list.isLoading ? (
        <ul className="flex flex-col gap-6">
          {SKELETON_KEYS.map((k) => (
            <ReviewRowSkeleton key={k} />
          ))}
        </ul>
      ) : list.isError && rows.length === 0 ? (
        <InlineErrorRetry
          message="We couldn't load these reviews."
          onRetry={() => list.refetch()}
        />
      ) : rows.length === 0 && !sharedRow ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">{empty.title}</p>
          <p className="text-sm text-muted-foreground">{empty.description}</p>
          {rating ? (
            <button
              type="button"
              onClick={() => setRating(null)}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              Show all reviews
            </button>
          ) : null}
        </div>
      ) : (
        <div>
          <ul
            className={`flex flex-col gap-6 ${list.isPlaceholderData ? "opacity-60" : ""}`}
            aria-busy={list.isFetching}
          >
            {rows.map((r) => renderReview(r))}
          </ul>
          <div ref={sentinelRef} aria-hidden className="h-px" />
          <InfiniteScrollStatus
            isFetchingNextPage={list.isFetchingNextPage}
            hasNextPage={!!list.hasNextPage}
            isError={list.isFetchNextPageError}
            onRetry={() => list.fetchNextPage()}
            itemCount={rows.length}
          />
        </div>
      )}
    </div>
  );
}
