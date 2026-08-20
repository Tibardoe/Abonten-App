"use client";

import { postPlaceReview } from "@/actions/postPlaceReview";
import MaskIcon from "@/components/atoms/MaskIcon";
import Notification from "@/components/atoms/Notification";
import StarRatingInput from "@/components/atoms/StarRatingInput";
import { Button } from "@/components/ui/button";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type PlaceReviewModalProps = {
  placeId: string;
  handleShowReviewModal: (state: boolean) => void;
  onReviewSubmitted?: () => void;
};

// Unlike ReviewModal.tsx (event/organizer reviews), title and comment are
// both optional here -- place_review.title/comment are nullable columns and
// postPlaceReview.ts's input type marks both optional. There is also no
// draft support (Places reviews have no review_drafts-equivalent table --
// confirmed Phase 1 simplification), so this modal skips
// SaveDraftConfirmDialog entirely: Cancel just closes.
const placeReviewSchema = z.object({
  title: z
    .string()
    .max(150, { message: "Title must be less than 150 characters" })
    .optional(),
  comment: z
    .string()
    .max(500, { message: "Comment must be less than 500 characters" })
    .optional(),
});

type PlaceReviewFormValues = z.infer<typeof placeReviewSchema>;

export default function PlaceReviewModal({
  placeId,
  handleShowReviewModal,
  onReviewSubmitted,
}: PlaceReviewModalProps) {
  useBodyScrollLock(true);

  const queryClient = useQueryClient();

  const [rating, setRating] = useState(0);
  const [notification, setNotification] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PlaceReviewFormValues>({
    resolver: zodResolver(placeReviewSchema),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (formData: PlaceReviewFormValues) =>
      postPlaceReview({ placeId, rating, ...formData }),
    onSuccess: (response) => {
      setNotification(response.message ?? null);
      setTimeout(() => setNotification(null), 3000);

      if (response.status === 200) {
        handleShowReviewModal(false);
        queryClient.invalidateQueries({
          queryKey: ["place-reviews", placeId],
        });
        queryClient.invalidateQueries({ queryKey: ["place-rating", placeId] });
        onReviewSubmitted?.();
      }
    },
  });

  const onSubmit = (formData: PlaceReviewFormValues) => {
    if (rating <= 0) {
      setNotification("Please select a rating.");
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    mutate(formData);
  };

  return (
    <>
      <div className="fixed top-0 left-0 h-dvh w-full bg-overlay/50 z-30 flex justify-center items-center">
        <div className="w-full self-end md:self-center h-[95%] md:h-fit p-4 md:w-[70%] lg:w-[40%] bg-card text-card-foreground md:p-4 rounded-lg space-y-5">
          {/* header */}
          <div className="flex justify-between items-center">
            <button
              type="button"
              className="md:hidden font-bold"
              onClick={() => handleShowReviewModal(false)}
            >
              Cancel
            </button>

            <h1 className="mx-auto text-xl md:text-2xl font-bold">
              Add Review
            </h1>

            <button
              type="submit"
              className="md:hidden font-bold"
              onClick={handleSubmit(onSubmit)}
            >
              Submit
            </button>

            <button
              type="button"
              className="hidden md:flex"
              onClick={() => handleShowReviewModal(false)}
            >
              <MaskIcon
                src="/assets/images/circularCancel.svg"
                alt="Cancel"
                className="w-[25px] h-[25px] bg-foreground"
              />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <div className="flex items-center justify-between md:flex-col md:justify-start md:items-start md:gap-2">
              <p className="font-normal">Rate</p>
              <StarRatingInput onChange={setRating} />
            </div>
            {rating <= 0 && (
              <p className="text-destructive text-sm">Rating required</p>
            )}

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <input
                type="text"
                placeholder="Title (optional)"
                className="border border-input bg-background rounded-lg py-4 px-2 font-normal"
                {...register("title")}
              />
              {errors.title && (
                <p className="text-destructive text-sm">
                  {errors.title.message}
                </p>
              )}

              <textarea
                rows={10}
                placeholder="Review (optional)"
                className="border border-input bg-background rounded-lg py-4 px-2 font-normal"
                {...register("comment")}
              />
              {errors.comment && (
                <p className="text-destructive text-sm">
                  {errors.comment.message}
                </p>
              )}

              <Button
                type="submit"
                disabled={isPending}
                className="rounded-md px-3 py-3 self-end font-bold hidden md:flex"
              >
                {isPending ? "Adding review..." : "Add"}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <Notification notification={notification} />
    </>
  );
}
