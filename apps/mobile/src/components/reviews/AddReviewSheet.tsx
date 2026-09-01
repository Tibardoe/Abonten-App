import { usePostEventReview } from "@/features/reviews/useEventReviews";
import { AppText, Button, Field, Input, Sheet } from "@abonten/ui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { StarRatingInput } from "./StarRatingInput";

// Native echo of the web EventReviewModal: rating (required, 1–5) + optional
// title (≤150) + optional comment (≤500). Photo attachments are deferred
// (they need the Cloudinary signed-upload flow). The DB's
// UNIQUE(event_id, reviewer_id) is the backstop against a double submit.

export function AddReviewSheet({
  open,
  onClose,
  eventId,
  eventTitle,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  onSubmitted?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const post = usePostEventReview();

  useEffect(() => {
    if (open) {
      setRating(0);
      setTitle("");
      setComment("");
      setError(null);
    }
  }, [open]);

  function submit() {
    setError(null);
    if (rating <= 0) {
      setError("Please select a rating.");
      return;
    }
    if (title.length > 150) {
      setError("Title must be less than 150 characters.");
      return;
    }
    if (comment.length > 500) {
      setError("Comment must be less than 500 characters.");
      return;
    }
    post.mutate(
      {
        eventId,
        rating,
        title: title || undefined,
        comment: comment || undefined,
      },
      {
        onSuccess: () => {
          onSubmitted?.();
          onClose();
        },
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Something went wrong."),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add review"
      footer={
        <Button
          title={post.isPending ? "Submitting…" : "Submit review"}
          onPress={submit}
          disabled={post.isPending}
        />
      }
    >
      <View className="gap-4">
        <AppText variant="muted" numberOfLines={2}>
          How was {eventTitle}?
        </AppText>

        <View className="gap-2">
          <AppText variant="label">Rating</AppText>
          <StarRatingInput value={rating} onChange={setRating} />
        </View>

        <Field label="Title (optional)">
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="Sum it up"
            maxLength={150}
          />
        </Field>

        <Field label="Review (optional)">
          <Input
            value={comment}
            onChangeText={setComment}
            placeholder="Share the details"
            multiline
            numberOfLines={5}
            maxLength={500}
            style={{ minHeight: 110, textAlignVertical: "top" }}
          />
        </Field>

        {error ? (
          <AppText className="text-[13px] text-destructive">{error}</AppText>
        ) : null}
      </View>
    </Sheet>
  );
}
