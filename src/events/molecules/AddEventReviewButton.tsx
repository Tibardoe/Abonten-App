"use client";

import { deleteEventReview } from "@/actions/deleteEventReview";
import { getEventReviewEligibility } from "@/actions/getEventReviewEligibility";
import StarRatingDisplay from "@/components/atoms/Rating";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { Occurrence } from "@/types/occurrenceType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import EventReviewModal from "../organisms/EventReviewModal";

type AddEventReviewButtonProps = {
  eventId: string;
  // Compared against the signed-in user so an organizer can't review their
  // own event -- postEventReview.ts/getEventReviewEligibility.ts re-enforce
  // this and the attendance/timing requirements server-side.
  organizerId: string;
  eventStatus: string;
  startsAt: string | null;
  endsAt: string | null;
  occurrences: Occurrence[] | null;
};

// Drives every review-CTA state the Event Details page can be in: signed
// out/organizer (nothing), not ended yet, cancelled, ended-but-not-attended,
// already reviewed (Your Review + Edit/Delete), or eligible (Write a
// Review). All server-computed via getEventReviewEligibility.ts so the UI
// never shows an action that would just fail on click.
export default function AddEventReviewButton({
  eventId,
  organizerId,
  eventStatus,
  startsAt,
  endsAt,
  occurrences,
}: AddEventReviewButtonProps) {
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUser();

  const { data: eligibility } = useQuery({
    queryKey: ["event-review-eligibility", eventId],
    queryFn: () =>
      getEventReviewEligibility(
        eventId,
        organizerId,
        eventStatus,
        startsAt,
        endsAt,
        occurrences,
      ),
    enabled: !!user && user.id !== organizerId,
  });

  const invalidateReviewQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["event-reviews", eventId] });
    queryClient.invalidateQueries({ queryKey: ["event-rating", eventId] });
    queryClient.invalidateQueries({
      queryKey: ["event-review-eligibility", eventId],
    });
    // Keeps My Tickets' To Review/Reviewed tabs (and their badge counts)
    // correct if the viewer already has that page mounted elsewhere in the
    // same session -- harmless no-op otherwise, since invalidating an
    // unmounted query just marks it stale for its next fetch.
    queryClient.invalidateQueries({ queryKey: ["events-awaiting-review"] });
    queryClient.invalidateQueries({ queryKey: ["user-event-reviews"] });
    queryClient.invalidateQueries({ queryKey: ["attending-events-counts"] });
  };

  const { mutate: deleteReview, isPending: isDeleting } = useMutation({
    mutationFn: (reviewId: string) => deleteEventReview(reviewId),
    onSuccess: (response) => {
      if (response.status === 200) {
        setShowDeleteConfirm(false);
        invalidateReviewQueries();
      }
    },
  });

  if (!user || user.id === organizerId) return null;
  // Loading: render nothing rather than flashing the wrong state.
  if (!eligibility) return null;

  if (!eligibility.canReview) {
    switch (eligibility.reason) {
      case "signed_out":
      case "organizer":
        return null;
      case "cancelled":
        return (
          <p className="text-sm text-muted-foreground">
            Reviews aren&apos;t available for cancelled events.
          </p>
        );
      case "not_ended":
        return (
          <p className="text-sm text-muted-foreground">
            Reviews will be available after this event.
          </p>
        );
      case "not_attended":
        return (
          <p className="text-sm text-muted-foreground">
            Only attendees can review this event.
          </p>
        );
      case "has_review": {
        const { ownReview } = eligibility;
        return (
          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-card-foreground">
                Your Review
              </span>
              <StarRatingDisplay rating={ownReview.rating} />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowReviewModal(true)}
                className="text-sm text-primary hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-sm text-destructive hover:underline"
              >
                Delete
              </button>
            </div>

            {showReviewModal && (
              <EventReviewModal
                eventId={eventId}
                handleShowReviewModal={setShowReviewModal}
                existingReview={ownReview}
              />
            )}

            {showDeleteConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4">
                <div className="bg-card text-card-foreground rounded-lg p-6 w-full max-w-sm space-y-4 shadow-lg">
                  <p className="font-medium">Delete your review?</p>
                  <p className="text-sm text-muted-foreground">
                    This can&apos;t be undone.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => deleteReview(ownReview.id)}
                      className="px-3 py-1.5 rounded-md text-sm bg-destructive text-destructive-foreground disabled:opacity-60"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-sm text-muted-foreground">How was this event?</p>

      {showReviewModal && (
        <EventReviewModal
          eventId={eventId}
          handleShowReviewModal={setShowReviewModal}
        />
      )}

      <Button
        className="p-3 rounded-md font-semibold"
        onClick={() => setShowReviewModal(true)}
      >
        Write a Review
      </Button>
    </div>
  );
}
