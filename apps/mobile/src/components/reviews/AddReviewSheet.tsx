import { UploadProgress } from "@/components/UploadProgress";
import {
  type ReviewPhotoInput,
  usePostEventReview,
} from "@/features/reviews/useEventReviews";
import { useUploadProgress } from "@/features/uploads/useUploadProgress";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import {
  MAX_REVIEW_PHOTOS,
  MAX_REVIEW_PHOTO_SIZE_BYTES,
} from "@abonten/core/uploadLimits";
import {
  AppText,
  Button,
  Field,
  Icon,
  Input,
  Sheet,
  useToast,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
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
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const progress = useUploadProgress();
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
      toast.error("Photo access needed", {
        description: "Allow photo access to attach photos to your review.",
      });
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
      progress.start();
      try {
        // Sequential, not Promise.all: one shared connection means parallel
        // uploads only fight each other on a slow link, and a fraction only
        // means something when one file is in flight at a time.
        const total = photos.length;
        uploaded = [];
        for (const [i, uri] of photos.entries()) {
          const up = await uploadToCloudinary(uri, "event_review_photo", {
            onProgress: (f) => progress.onProgress((i + f) / total),
          });
          uploaded.push({ publicId: up.publicId, version: String(up.version) });
        }
      } catch {
        setUploading(false);
        progress.reset();
        setError(
          "One of your photos didn't upload. Your review is still here — check your connection and try again.",
        );
        return;
      }
      setUploading(false);
      progress.finishUpload();
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
          progress.reset();
          onSubmitted?.();
          onClose();
          toast.success("Review posted", {
            description: "Thanks — it is on the event page now.",
          });
        },
        onError: (e) => {
          progress.reset();
          setError(
            e instanceof Error
              ? e.message
              : "We couldn't post your review. Nothing was lost — try again.",
          );
        },
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

        <UploadProgress state={progress} what="photos" />

        {error ? (
          <AppText variant="small" tone="error">
            {error}
          </AppText>
        ) : null}
      </View>
    </Sheet>
  );
}
