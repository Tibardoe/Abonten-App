"use client";

import { deletePlaceReview } from "@/actions/deletePlaceReview";
import { getOwnPlaceReview } from "@/actions/getOwnPlaceReview";
import StarRatingDisplay from "@/components/atoms/Rating";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import PlaceReviewModal from "../organisms/PlaceReviewModal";

type AddPlaceReviewButtonProps = {
  placeId: string;
  // Compared against the signed-in user so an owner can't review their own
  // place -- mirrors the same check postPlaceReview.ts already enforces
  // server-side; this just avoids showing the button in the first place.
  ownerId: string;
};

// Mirrors AddEventReviewButton.tsx's "already reviewed -> Your Review
// (Edit/Delete)" state, without the attendance/timing eligibility branches
// events have -- places have neither, so the only two states here are
// "hasn't reviewed yet" (Add Review) and "has reviewed" (Your Review).
export default function AddPlaceReviewButton({
  placeId,
  ownerId,
}: AddPlaceReviewButtonProps) {
  const t = useTranslations("places");

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUser();

  const { data: ownReview } = useQuery({
    queryKey: ["own-place-review", placeId],
    queryFn: () => getOwnPlaceReview(placeId),
    enabled: !!user && user.id !== ownerId,
  });

  const invalidate = () => {
    // The preview, breakdown and every filtered list of this place's reviews.
    queryClient.invalidateQueries({ queryKey: ["reviews", "place", placeId] });
    queryClient.invalidateQueries({ queryKey: ["own-place-review", placeId] });
    queryClient.invalidateQueries({ queryKey: ["user-place-reviews"] });
    queryClient.invalidateQueries({ queryKey: ["attending-events-counts"] });
  };

  const { mutate: deleteReview, isPending: isDeleting } = useMutation({
    mutationFn: (reviewId: string) => deletePlaceReview(reviewId),
    onSuccess: (response) => {
      if (response.status === 200) {
        setShowDeleteConfirm(false);
        invalidate();
      }
    },
  });

  if (!user || user.id === ownerId) return null;

  if (ownReview) {
    return (
      <div className="flex flex-col items-start md:items-end gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-card-foreground">
            {t("yourReview")}
          </span>
          <StarRatingDisplay rating={ownReview.rating} />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowReviewModal(true)}
            className="text-sm text-primary hover:underline"
          >
            {t("edit")}
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm text-destructive hover:underline"
          >
            {t("deleteText")}
          </button>
        </div>

        {showReviewModal && (
          <PlaceReviewModal
            placeId={placeId}
            handleShowReviewModal={setShowReviewModal}
            existingReview={ownReview}
            onReviewSubmitted={invalidate}
          />
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4">
            <div className="bg-card text-card-foreground rounded-lg p-6 w-full max-w-sm space-y-4 shadow-lg">
              <p className="font-medium">{t("deleteYourReview")}</p>
              <p className="text-sm text-muted-foreground">
                {t("thisCanTBeUndone")}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-accent transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => deleteReview(ownReview.id)}
                  className="px-3 py-1.5 rounded-md text-sm bg-destructive text-destructive-foreground disabled:opacity-60"
                >
                  {isDeleting ? t("deleting") : t("deleteText")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {showReviewModal && (
        <PlaceReviewModal
          placeId={placeId}
          handleShowReviewModal={setShowReviewModal}
          onReviewSubmitted={invalidate}
        />
      )}

      <Button
        className="p-3 rounded-md font-semibold"
        onClick={() => setShowReviewModal(true)}
      >
        {t("addReview")}
      </Button>
    </>
  );
}
