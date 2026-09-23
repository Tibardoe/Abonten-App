import type { ReviewSubjectKind } from "@abonten/core/reviews/reviewList";
import {
  type EventForReview,
  type ReviewPhotoRow,
  useDeleteEventReview,
  useEventReviewEligibility,
} from "./useEventReviews";
import {
  useDeletePlaceReview,
  usePlaceReviewEligibility,
} from "./usePlaceReviews";

// One shape for "the thing being reviewed" and "where do I stand with it",
// so the details preview and the full Reviews screen treat events and places
// the same way. Eligibility itself stays where it was decided before:
// events by @abonten/core/eventReviewEligibility (and the database trigger),
// places by ownership only.

export type ReviewSubject = {
  kind: ReviewSubjectKind;
  id: string;
  /** Event title / place name, for copy and share text. */
  title: string;
  /** Event code or place slug — the segment its public link uses. */
  slug: string | null;
  /** The organizer / owner: they reply to reviews instead of writing one. */
  ownerId: string | null;
  /** Events only: what the review-eligibility rules need. */
  event?: EventForReview;
};

export type OwnReview = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  photos: ReviewPhotoRow[];
  /** The organizer's / owner's public reply, if any. */
  response: string | null;
};

export type OwnReviewState =
  | { state: "loading" }
  | { state: "signed_out" }
  | { state: "owner" }
  | { state: "can_review" }
  | { state: "has_review"; review: OwnReview }
  | { state: "not_eligible"; message: string };

const EVENT_REASON_COPY: Record<string, string> = {
  cancelled: "This event was cancelled, so it can't be reviewed.",
  not_ended: "You can review this event once it has ended.",
  not_attended:
    "Only people whose ticket was checked in at this event can review it.",
};

export function useOwnReview(
  subject: ReviewSubject | undefined,
): OwnReviewState {
  const isEvent = subject?.kind === "event";
  const event = useEventReviewEligibility(isEvent ? subject?.event : undefined);
  const place = usePlaceReviewEligibility(
    !isEvent ? subject?.id : undefined,
    !isEvent ? subject?.ownerId : undefined,
  );

  const data = isEvent ? event.data : place.data;
  if (!subject || !data) return { state: "loading" };
  if (data.canReview) return { state: "can_review" };
  switch (data.reason) {
    case "signed_out":
      return { state: "signed_out" };
    case "owner":
    case "organizer":
      return { state: "owner" };
    case "has_review": {
      const own = data.ownReview as {
        id: string;
        rating: number;
        title: string | null;
        comment: string | null;
        organizer_response?: string | null;
        owner_response?: string | null;
        event_review_photo?: ReviewPhotoRow[] | null;
        place_review_photo?: ReviewPhotoRow[] | null;
      };
      return {
        state: "has_review",
        review: {
          id: own.id,
          rating: own.rating,
          title: own.title,
          comment: own.comment,
          response: own.organizer_response ?? own.owner_response ?? null,
          photos: [
            ...(own.event_review_photo ?? own.place_review_photo ?? []),
          ].sort((a, b) => a.position - b.position),
        },
      };
    }
    default:
      return {
        state: "not_eligible",
        message:
          EVENT_REASON_COPY[data.reason] ?? "You can't review this right now.",
      };
  }
}

/** Deletes the viewer's own review of this subject. */
export function useDeleteOwnReview(subject: ReviewSubject | undefined) {
  const deleteEvent = useDeleteEventReview();
  const deletePlace = useDeletePlaceReview(
    subject?.kind === "place" ? subject.id : undefined,
  );
  return {
    isPending: deleteEvent.isPending || deletePlace.isPending,
    mutate: (
      reviewId: string,
      opts: { onSuccess?: () => void; onError?: (e: unknown) => void },
    ) => {
      if (!subject) return;
      if (subject.kind === "event") {
        deleteEvent.mutate({ reviewId, eventId: subject.id }, opts);
      } else {
        deletePlace.mutate(reviewId, opts);
      }
    },
  };
}
