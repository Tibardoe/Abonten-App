import { postReview } from "@/actions/postReview";
import { saveReviewDraft } from "@/actions/saveReviewDraft";
import MaskIcon from "@/components/atoms/MaskIcon";
import ModalShell from "@/components/atoms/ModalShell";
import { supabase } from "@/config/supabase/client";
import { useToast } from "@/hooks/useToast";
import { logger } from "@abonten/core/logger";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import StarRatingInput from "../atoms/StarRatingInput";
import { Button } from "../ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "../ui/form";
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

// Validation messages come from the catalog, so the schema is built inside
// the component once the translator is known.
const buildEventSchema = (m: {
  titleRequired: string;
  titleTooLong: string;
  descriptionRequired: string;
}) =>
  z.object({
    title: z
      .string()
      .min(1, { message: m.titleRequired })
      .max(150, { message: m.titleTooLong }),

    review: z.string().min(1, { message: m.descriptionRequired }),
  });

type EventSchemaValues = z.infer<ReturnType<typeof buildEventSchema>>;

export default function ReviewModal({
  handleShowReviewModal,
  username,
  draftId,
  initialValues,
  initialUpdatedAt,
  onReviewSubmitted,
  onDraftSaved,
}: ShowReviewModalProp) {
  const t = useTranslations("common");

  const router = useRouter();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(initialValues?.rating ?? 0);

  const toast = useToast();

  const [currentDraftId, setCurrentDraftId] = useState(draftId);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(initialUpdatedAt);
  const [touched, setTouched] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const eventSchema = useMemo(
    () =>
      buildEventSchema({
        titleRequired: t("validation.titleRequired"),
        titleTooLong: t("validation.titleTooLong"),
        descriptionRequired: t("validation.descriptionRequired"),
      }),
    [t],
  );

  const form = useForm<EventSchemaValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: initialValues?.title ?? undefined,
      review: initialValues?.comment ?? undefined,
    },
  });

  const {
    control,
    handleSubmit,
    getValues,
    formState: { isDirty },
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
        logger.error(error);
      }
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (formData: EventSchemaValues) => {
      if (!reviewedId) {
        throw new Error("Could not resolve the reviewed user. Try again.");
      }

      const finalData = {
        ...formData,
        rating: rating,
        reviewedId,
        draftId: currentDraftId,
      };

      return postReview(finalData);
    },
    onSuccess: (response) => {
      if (response?.status === 200) {
        toast.success(response.message);
        form.reset();
        setRating(0);
        handleShowReviewModal(false);
        router.refresh();
        // The reviews list (["user-reviews", username]) is a TanStack Query
        // cache that router.refresh() cannot touch once mounted.
        queryClient.invalidateQueries({ queryKey: ["user-reviews", username] });
        onReviewSubmitted?.();
      } else {
        toast.error(response.message);
      }
    },
  });

  const onSubmit = async (formData: EventSchemaValues) => {
    if (!reviewedId) {
      toast.error(t("userIdNotFoundYetPlease"));
      return;
    }

    mutate(formData);
  };

  const hasMeaningfulContent =
    Boolean(initialValues) || touched || isDirty || rating > 0;

  const handleSaveDraft = async () => {
    if (!reviewedId) {
      toast.error(t("userIdNotFoundYetPlease"));
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
      <ModalShell open onClose={requestClose} title={t("addReview")}>
        <div className="w-full self-end md:self-center h-[95%] md:h-fit p-4 md:w-[70%] lg:w-[40%] bg-card text-card-foreground md:p-4 rounded-lg space-y-5">
          {/* header */}
          <div className="flex justify-between items-center">
            <button
              type="button"
              className="md:hidden font-bold"
              onClick={requestClose}
            >
              {t("cancel")}
            </button>

            <h1 className="mx-auto text-xl md:text-2xl font-bold">
              {t("addReview")}
            </h1>

            <button
              type="submit"
              className="md:hidden font-bold"
              onClick={handleSubmit(onSubmit)}
            >
              {t("submit")}
            </button>

            <button
              type="button"
              className="hidden md:flex"
              onClick={requestClose}
            >
              <MaskIcon
                src="/assets/images/circularCancel.svg"
                alt={t("cancel")}
                className="w-[25px] h-[25px] bg-foreground"
              />
            </button>
          </div>

          {/* Content */}

          <div className="space-y-4">
            <div className="flex items-center justify-between md:flex-col md:justify-start md:items-start md:gap-2">
              <p className="font-normal">{t("rate")}</p>
              <StarRatingInput
                initialRating={initialValues?.rating ?? 0}
                onChange={handleRatingChange}
              />
            </div>
            {rating <= 0 && (
              <p className="text-destructive text-sm">{t("ratingRequired")}</p>
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
                          placeholder={t("title")}
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
                  name="review"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormControl>
                        <Textarea
                          rows={10}
                          placeholder={t("review")}
                          className="rounded-lg px-2 py-4 font-normal"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-sm" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md px-3 py-3 self-end font-bold hidden md:flex"
                >
                  {isPending ? t("addingReview") : t("add")}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </ModalShell>

      {showCancelConfirm && (
        <SaveDraftConfirmDialog
          message={t("youHaveUnsavedChangesToThis2")}
          isSaving={isSavingDraft}
          onSaveDraft={handleSaveDraftAndClose}
          onDiscard={() => {
            setShowCancelConfirm(false);
            handleShowReviewModal(false);
          }}
          onContinueEditing={() => setShowCancelConfirm(false)}
        />
      )}
    </>
  );
}
