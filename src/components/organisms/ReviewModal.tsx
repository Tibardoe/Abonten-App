import { postReview } from "@/actions/postReview";
import { saveReviewDraft } from "@/actions/saveReviewDraft";
import MaskIcon from "@/components/atoms/MaskIcon";
import { supabase } from "@/config/supabase/client";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import Notification from "../atoms/Notification";
import StarRatingInput from "../atoms/StarRatingInput";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import SaveDraftConfirmDialog from "./SaveDraftConfirmDialog";

type ShowReviewModalProp = {
  handleShowReviewModal: (state: boolean) => void;
  username: string;
  // Continue-draft mode.
  draftId?: string;
  initialValues?: {
    title: string | null;
    comment: string | null;
    rating: number | null;
  };
  initialUpdatedAt?: string;
  // Fired after a successful submit (publish) — distinct from onDraftSaved,
  // which fires for "Save Draft & close" instead.
  onReviewSubmitted?: () => void;
  // Fired after a successful "Save Draft & close".
  onDraftSaved?: () => void;
};

const eventSchema = z.object({
  title: z
    .string()
    .min(1, { message: "Title is required" })
    .max(150, { message: "Title must be less than 150 characters" }),

  review: z.string().min(1, { message: "Description is required" }),
});

export default function ReviewModal({
  handleShowReviewModal,
  username,
  draftId,
  initialValues,
  initialUpdatedAt,
  onReviewSubmitted,
  onDraftSaved,
}: ShowReviewModalProp) {
  useBodyScrollLock(true);

  const router = useRouter();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(initialValues?.rating ?? 0);

  const [notification, setNotification] = useState<string | null>(null);

  const [currentDraftId, setCurrentDraftId] = useState(draftId);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(initialUpdatedAt);
  const [touched, setTouched] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: initialValues?.title ?? undefined,
      review: initialValues?.comment ?? undefined,
    },
  });

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isDirty },
  } = form;

  const handleRatingChange = (value: number) => {
    setTouched(true);
    setRating(value);
  };

  const { data: reviewedId } = useQuery({
    queryKey: ["reviewed-details", username],
    queryFn: async () => {
      try {
        const { data: user } = await supabase
          .from("user_info")
          .select("id")
          .eq("username", username)
          .single();

        return user?.id;
      } catch (error) {
        console.log(error);
      }
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (formData: z.infer<typeof eventSchema>) => {
      const finalData = {
        ...formData,
        rating: rating,
        reviewedId: reviewedId,
        draftId: currentDraftId,
      };

      return postReview(finalData);
    },
    onSuccess: (response) => {
      setNotification(response.message);
      setTimeout(() => setNotification(null), 3000);

      if (response?.status === 200) {
        form.reset();
        setRating(0);
        handleShowReviewModal(false);
        router.refresh();
        // The reviews list (["user-reviews", username]) is a TanStack Query
        // cache that router.refresh() cannot touch once mounted.
        queryClient.invalidateQueries({ queryKey: ["user-reviews", username] });
        onReviewSubmitted?.();
      }
    },
  });

  const onSubmit = async (formData: z.infer<typeof eventSchema>) => {
    if (!reviewedId) {
      setNotification("User ID not found yet. Please wait...");
      return;
    }

    mutate(formData);
  };

  const hasMeaningfulContent =
    Boolean(initialValues) || touched || isDirty || rating > 0;

  const handleSaveDraft = async () => {
    if (!reviewedId) {
      setNotification("User ID not found yet. Please wait...");
      return null;
    }

    setIsSavingDraft(true);
    try {
      const values = getValues();
      const response = await saveReviewDraft({
        draftId: currentDraftId,
        expectedUpdatedAt: draftUpdatedAt,
        payload: {
          reviewedId,
          title: values.title || undefined,
          comment: values.review || undefined,
          rating: rating > 0 ? rating : undefined,
        },
      });

      if (response.status === 200 && response.data) {
        setCurrentDraftId(response.data.draftId);
        setDraftUpdatedAt(response.data.updatedAt);
      }

      return response;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const requestClose = () => {
    if (hasMeaningfulContent) {
      setShowCancelConfirm(true);
    } else {
      handleShowReviewModal(false);
    }
  };

  const handleSaveDraftAndClose = async () => {
    const response = await handleSaveDraft();
    setShowCancelConfirm(false);
    if (response?.status === 200) {
      handleShowReviewModal(false);
      onDraftSaved?.();
    }
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
              onClick={requestClose}
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
              onClick={requestClose}
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
              <StarRatingInput
                initialRating={initialValues?.rating ?? 0}
                onChange={handleRatingChange}
              />
            </div>
            {rating <= 0 && (
              <p className="text-destructive text-sm">Rating required</p>
            )}

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <Input
                type="text"
                placeholder="Title"
                className="rounded-lg px-2 py-4 font-normal"
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              {errors.title && (
                <p className="text-destructive text-sm">
                  {errors.title.message}
                </p>
              )}

              <Textarea
                rows={10}
                placeholder="Review"
                className="rounded-lg px-2 py-4 font-normal"
                aria-invalid={!!errors.review}
                {...register("review")}
              />
              {errors.review && (
                <p className="text-destructive text-sm">
                  {errors.review.message}
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

      {showCancelConfirm && (
        <SaveDraftConfirmDialog
          message="You have unsaved changes to this review."
          isSaving={isSavingDraft}
          onSaveDraft={handleSaveDraftAndClose}
          onDiscard={() => {
            setShowCancelConfirm(false);
            handleShowReviewModal(false);
          }}
          onContinueEditing={() => setShowCancelConfirm(false)}
        />
      )}

      <Notification notification={notification} />
    </>
  );
}
