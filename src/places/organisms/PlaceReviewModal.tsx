"use client";

import getPlaceReviewPhotoUploadSignature from "@/actions/getPlaceReviewPhotoUploadSignature";
import { postPlaceReview } from "@/actions/postPlaceReview";
import { updatePlaceReview } from "@/actions/updatePlaceReview";
import MaskIcon from "@/components/atoms/MaskIcon";
import StarRatingInput from "@/components/atoms/StarRatingInput";
import ExistingReviewPhotoGrid from "@/components/molecules/ExistingReviewPhotoGrid";
import ReviewPhotoPicker from "@/components/molecules/ReviewPhotoPicker";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useReviewPhotoUpload } from "@/hooks/useReviewPhotoUpload";
import { useToast } from "@/hooks/useToast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type ExistingReviewPhoto = {
  id: string;
  public_id: string;
  version: string;
  position: number;
};

type ExistingReview = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  place_review_photo?: ExistingReviewPhoto[];
};

type PlaceReviewModalProps = {
  placeId: string;
  handleShowReviewModal: (state: boolean) => void;
  onReviewSubmitted?: () => void;
  // When present, the modal edits this review (updatePlaceReview) instead of
  // creating a new one -- mirrors EventReviewModal.tsx's existingReview prop.
  existingReview?: ExistingReview;
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
  existingReview,
}: PlaceReviewModalProps) {
  useBodyScrollLock(true);

  const isEditing = !!existingReview;
  const queryClient = useQueryClient();

  const toast = useToast();
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [existingPhotos, setExistingPhotos] = useState<ExistingReviewPhoto[]>(
    existingReview?.place_review_photo ?? [],
  );
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const photoUpload = useReviewPhotoUpload(
    getPlaceReviewPhotoUploadSignature,
    existingPhotos.length,
  );

  const removeExistingPhoto = (photoId: string) => {
    setExistingPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
    setRemovedPhotoIds((prev) => [...prev, photoId]);
  };

  const form = useForm<PlaceReviewFormValues>({
    resolver: zodResolver(placeReviewSchema),
    defaultValues: {
      title: existingReview?.title ?? undefined,
      comment: existingReview?.comment ?? undefined,
    },
  });
  const { control, handleSubmit } = form;

  const { mutate, isPending } = useMutation({
    mutationFn: (formData: PlaceReviewFormValues) =>
      existingReview
        ? updatePlaceReview({
            reviewId: existingReview.id,
            rating,
            ...formData,
            removedPhotoIds,
            newPhotos: photoUpload.uploadedPhotos,
          })
        : postPlaceReview({
            placeId,
            rating,
            ...formData,
            photos: photoUpload.uploadedPhotos,
          }),
    onSuccess: (response) => {
      if (response.status === 200) {
        if (response.message) toast.success(response.message);
        handleShowReviewModal(false);
        queryClient.invalidateQueries({
          queryKey: ["place-reviews", placeId],
        });
        queryClient.invalidateQueries({ queryKey: ["place-rating", placeId] });
        queryClient.invalidateQueries({
          queryKey: ["own-place-review", placeId],
        });
        onReviewSubmitted?.();
      } else if (response.message) {
        toast.error(response.message);
      }
    },
  });

  const onSubmit = (formData: PlaceReviewFormValues) => {
    if (rating <= 0) {
      toast.error("Please select a rating.");
      return;
    }

    if (photoUpload.isUploading) {
      toast.error("Please wait for photos to finish uploading.");
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
              {isEditing ? "Edit Review" : "Add Review"}
            </h1>

            <button
              type="submit"
              className="md:hidden font-bold disabled:opacity-60"
              disabled={isPending || photoUpload.isUploading}
              onClick={handleSubmit(onSubmit)}
            >
              {isPending ? "Submitting..." : "Submit"}
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
              <StarRatingInput onChange={setRating} initialRating={rating} />
            </div>
            {rating <= 0 && (
              <p className="text-destructive text-sm">Rating required</p>
            )}

            <Form {...form}>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
              >
                <FormField
                  control={control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Title (optional)"
                          className="rounded-lg px-2 py-4 font-normal"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-sm" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormControl>
                        <Textarea
                          rows={10}
                          placeholder="Review (optional)"
                          className="rounded-lg px-2 py-4 font-normal"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-sm" />
                    </FormItem>
                  )}
                />

                {isEditing && existingPhotos.length > 0 && (
                  <ExistingReviewPhotoGrid
                    photos={existingPhotos}
                    onRemove={removeExistingPhoto}
                  />
                )}

                <ReviewPhotoPicker
                  items={photoUpload.items}
                  atLimit={photoUpload.atLimit}
                  onFilesSelected={photoUpload.addFiles}
                  onRemove={photoUpload.remove}
                />

                <Button
                  type="submit"
                  disabled={isPending || photoUpload.isUploading}
                  className="rounded-md px-3 py-3 self-end font-bold hidden md:flex"
                >
                  {isPending
                    ? isEditing
                      ? "Saving changes..."
                      : "Adding review..."
                    : isEditing
                      ? "Save Changes"
                      : "Add"}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </>
  );
}
