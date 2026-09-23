"use client";

import StarRatingDisplay from "@/components/atoms/Rating";
import ReviewListItem from "@/components/molecules/ReviewListItem";
import ReviewRowSkeleton from "@/components/molecules/ReviewRowSkeleton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { roundRating } from "@abonten/core/ratings";
import {
  type ReviewListRow,
  type ReviewSubjectKind,
  type ReviewSummary,
  emptyReviewsMessage,
  formatReviewCount,
  reviewsPath,
} from "@abonten/core/reviews/reviewList";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import OrganizerReplyControls from "../molecules/OrganizerReplyControls";
import ReviewItemActions from "../molecules/ReviewItemActions";
import { useReviewPreview, useReviewSummary } from "../useReviewQueries";

// The reviews block on an event or place page. It never loads the whole
// history: the rating summary and the three most helpful reviews, then
// "See all N reviews" opens /events/<code>/reviews or /places/<slug>/reviews
// with the breakdown, star filters, sorting and the rest. The first render
// is the public view the page was built with; the visitor's own view (their
// votes, people they blocked) replaces it once their session is known.

export type ReviewsSubject = {
  kind: ReviewSubjectKind;
  id: string;
  /** Event code / place slug — the segment of its public link. */
  slug: string;
  title: string;
  /** The organizer / place owner. */
  ownerId: string | null;
};

export default function ReviewsPreview({
  subject,
  initialSummary,
  initialReviews,
  addReviewButton,
}: {
  subject: ReviewsSubject;
  initialSummary: ReviewSummary;
  initialReviews: ReviewListRow[];
  /** "Write a review" / "Your review" (AddEventReviewButton / AddPlaceReviewButton). */
  addReviewButton: ReactNode;
}) {
  const { data: user } = useCurrentUser();
  const viewerId = user?.id ?? null;
  const summary = useReviewSummary(subject.kind, subject.id, initialSummary);
  const preview = useReviewPreview(subject.kind, subject.id, initialReviews);

  const total = summary.data?.total ?? 0;
  const average = roundRating(summary.data?.average ?? 0);
  const reviews = preview.data ?? [];
  const allHref = reviewsPath(subject.kind, subject.slug);
  const empty = emptyReviewsMessage(null, subject.kind);
  const isOrganizer =
    subject.kind === "event" && !!viewerId && viewerId === subject.ownerId;

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm space-y-4 scroll-mt-20"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="reviews-heading"
            className="text-xl md:text-2xl font-medium text-card-foreground"
          >
            Reviews
          </h2>
          {total > 0 ? (
            <Link
              href={allHref}
              className="mt-1 flex items-center gap-2 hover:underline"
            >
              <span className="text-lg font-semibold">
                {average.toFixed(1)}
              </span>
              <StarRatingDisplay rating={summary.data?.average ?? 0} />
              <span className="text-sm text-muted-foreground">
                ({formatReviewCount(total)})
              </span>
            </Link>
          ) : null}
        </div>
        {addReviewButton}
      </div>

      {preview.isLoading ? (
        <ul className="flex flex-col gap-6">
          {["a", "b"].map((k) => (
            <ReviewRowSkeleton key={k} />
          ))}
        </ul>
      ) : reviews.length > 0 ? (
        <ul className="flex flex-col gap-6">
          {reviews.map((review) => (
            <ReviewListItem
              key={review.id}
              review={review}
              kind={subject.kind}
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
          ))}
        </ul>
      ) : preview.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load reviews.{" "}
          <button
            type="button"
            onClick={() => preview.refetch()}
            className="font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </p>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="font-medium">{empty.title}</p>
          <p className="text-sm text-muted-foreground">{empty.description}</p>
        </div>
      )}

      {total > reviews.length ? (
        <Link
          href={allHref}
          className="flex items-center justify-center gap-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent"
        >
          See all {formatReviewCount(total)}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}
