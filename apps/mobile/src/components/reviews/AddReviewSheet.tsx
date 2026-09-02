import {
  type ReviewPhotoInput,
  usePostEventReview,
} from "@/features/reviews/useEventReviews";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import {
  MAX_REVIEW_PHOTOS,
  MAX_REVIEW_PHOTO_SIZE_BYTES,
} from "@abonten/core/uploadLimits";
import { AppText, Button, Field, Icon, Input, Sheet } from "@abonten/ui-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { StarRatingInput } from "./StarRatingInput";

// Native echo of the web EventReviewModal: rating (required, 1–5) + optional
// title (≤150) + optional comment (≤500) + up to MAX_REVIEW_PHOTOS photos.
// Photos are uploaded straight to Cloudinary with a short-lived server
// signature (kind "event_review_photo", folder-scoped to the caller) and
// attached to the review row after it saves. The DB's
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = usePostEventReview();

  useEffect(() => {
    if (open) {
      setRating(0);
      setTitle("");
      setComment("");
      setPhotos([]);
      setUploading(false);
      setError(null);
    }
  }, [open]);

  async function pickPhotos() {
    setError(null);
    const remaining = MAX_REVIEW_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to attach photos to your review.",
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const accepted: string[] = [];
    for (const asset of picked.assets) {
      if (
        typeof asset.fileSize === "number" &&
        asset.fileSize > MAX_REVIEW_PHOTO_SIZE_BYTES
      ) {
        setError(
          `Each photo must be ${Math.round(
            MAX_REVIEW_PHOTO_SIZE_BYTES / (1024 * 1024),
          )}MB or smaller.`,
        );
        continue;
      }
      accepted.push(asset.uri);
    }
    setPhotos((prev) => [...prev, ...accepted].slice(0, MAX_REVIEW_PHOTOS));
  }

  function removePhoto(uri: string) {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  }

  async function submit() {
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

    let uploaded: ReviewPhotoInput[] = [];
    if (photos.length > 0) {
      setUploading(true);
      try {
        uploaded = await Promise.all(
          photos.map(async (uri) => {
            const up = await uploadToCloudinary(uri, "event_review_photo");
            return { publicId: up.publicId, version: String(up.version) };
          }),
        );
      } catch {
        setUploading(false);
        setError("Couldn't upload one of your photos. Please try again.");
        return;
      }
      setUploading(false);
    }

    post.mutate(
      {
        eventId,
        rating,
        title: title || undefined,
        comment: comment || undefined,
        photos: uploaded.length ? uploaded : undefined,
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

  const busy = uploading || post.isPending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add review"
      footer={
        <Button
          title={
            uploading
              ? "Uploading photos…"
              : post.isPending
                ? "Submitting…"
                : "Submit review"
          }
          onPress={submit}
          disabled={busy}
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

        <View className="gap-2">
          <AppText variant="label">
            Photos (optional) · {photos.length}/{MAX_REVIEW_PHOTOS}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 py-1"
          >
            {photos.map((uri) => (
              <View key={uri}>
                <Image
                  source={{ uri }}
                  style={{ width: 76, height: 76, borderRadius: 8 }}
                  contentFit="cover"
                />
                <Pressable
                  onPress={() => removePhoto(uri)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5"
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Icon name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_REVIEW_PHOTOS ? (
              <Pressable
                onPress={pickPhotos}
                className="h-[76px] w-[76px] items-center justify-center rounded-lg border border-dashed border-border"
                accessibilityRole="button"
                accessibilityLabel="Add photos"
              >
                <Icon name="camera-outline" size={22} tone="muted" />
              </Pressable>
            ) : null}
          </ScrollView>
        </View>

        {error ? (
          <AppText className="text-[13px] text-destructive">{error}</AppText>
        ) : null}
      </View>
    </Sheet>
  );
}
