import {
  QUEUED_WRITE_LABEL,
  QueuedWriteNotice,
} from "@/components/QueuedWriteNotice";
import { UploadProgress } from "@/components/UploadProgress";
import { announcePlaceInteraction } from "@/features/alerts/placeInteraction";
import {
  type ReviewPhotoInput,
  usePostEventReview,
  useUpdateEventReview,
} from "@/features/reviews/useEventReviews";
import {
  usePostPlaceReview,
  useUpdatePlaceReview,
} from "@/features/reviews/usePlaceReviews";
import type { OwnReview } from "@/features/reviews/useReviewSubject";
import { useUploadProgress } from "@/features/uploads/useUploadProgress";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type { ReviewSubjectKind } from "@abonten/core/reviews/reviewList";
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

// Write or edit a review of an event or a place — the native echo of the
// web EventReviewModal / PlaceReviewModal. Rating (required, 1–5), optional
// title (≤150) and comment (≤500), up to MAX_REVIEW_PHOTOS photos. Photos go
// straight to Cloudinary with a short-lived signature scoped to the caller's
// own folder and are attached once the review row is saved; on edit, kept
// photos stay, removed ones are deleted by id and new ones follow them.
// Who may review is decided by the database (event_review eligibility
// trigger, UNIQUE per subject and reviewer), not by this sheet.

type ExistingPhoto = OwnReview["photos"][number];

export function ReviewComposerSheet({
  open,
  onClose,
  onDismiss,
  kind,
  subjectId,
  subjectTitle,
  existingReview,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  kind: ReviewSubjectKind;
  subjectId: string;
  subjectTitle: string;
  existingReview?: OwnReview | null;
  onSubmitted?: () => void;
}) {
  const toast = useToast();
  const isEditing = !!existingReview;
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const progress = useUploadProgress();
  const [error, setError] = useState<string | null>(null);

  const postEvent = usePostEventReview();
  const updateEvent = useUpdateEventReview();
  const postPlace = usePostPlaceReview(
    kind === "place" ? subjectId : undefined,
  );
  const updatePlace = useUpdatePlaceReview(
    kind === "place" ? subjectId : undefined,
  );
  const post = kind === "event" ? postEvent : postPlace;
  const update = kind === "event" ? updateEvent : updatePlace;

  useEffect(() => {
    if (!open) return;
    setRating(existingReview?.rating ?? 0);
    setTitle(existingReview?.title ?? "");
    setComment(existingReview?.comment ?? "");
    setExistingPhotos(existingReview?.photos ?? []);
    setRemovedPhotoIds([]);
    setNewPhotos([]);
    setUploading(false);
    setError(null);
  }, [open, existingReview]);

  const photoCount = existingPhotos.length + newPhotos.length;

  async function pickPhotos() {
    setError(null);
    const remaining = MAX_REVIEW_PHOTOS - photoCount;
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
    setNewPhotos((prev) =>
      [...prev, ...accepted].slice(
        0,
        MAX_REVIEW_PHOTOS - existingPhotos.length,
      ),
    );
  }

  function removeExisting(id: string) {
    setExistingPhotos((prev) => prev.filter((p) => p.id !== id));
    setRemovedPhotoIds((prev) => [...prev, id]);
  }
  function removeNew(uri: string) {
    setNewPhotos((prev) => prev.filter((p) => p !== uri));
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
    if (newPhotos.length > 0) {
      setUploading(true);
      progress.start();
      try {
        // Sequential, not Promise.all: on a slow link parallel uploads only
        // fight each other, and a fraction only means something when one
        // file is in flight at a time.
        const total = newPhotos.length;
        uploaded = [];
        for (const [i, uri] of newPhotos.entries()) {
          const up = await uploadToCloudinary(
            uri,
            kind === "event" ? "event_review_photo" : "place_review_photo",
            { onProgress: (f) => progress.onProgress((i + f) / total) },
          );
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

    const onDone = () => {
      progress.reset();
      onSubmitted?.();
      if (!isEditing && kind === "place") {
        announcePlaceInteraction({ placeId: subjectId, trigger: "review" });
      }
      onClose();
      toast.success(isEditing ? "Review updated" : "Review posted", {
        description: isEditing
          ? "Your changes are saved."
          : `Thanks — it's on the ${kind} page now.`,
      });
    };
    const onErr = (e: unknown) => {
      progress.reset();
      setError(
        e instanceof Error && e.message
          ? e.message
          : "We couldn't save your review. Nothing was lost — try again.",
      );
    };

    const fields = {
      rating,
      title: title || undefined,
      comment: comment || undefined,
    };
    if (isEditing && existingReview) {
      const edit = {
        ...fields,
        reviewId: existingReview.id,
        removedPhotoIds: removedPhotoIds.length ? removedPhotoIds : undefined,
        newPhotos: uploaded.length ? uploaded : undefined,
        keptPhotoCount: existingPhotos.length,
      };
      if (kind === "event") {
        updateEvent.mutate(
          { ...edit, eventId: subjectId },
          { onSuccess: onDone, onError: onErr },
        );
      } else {
        updatePlace.mutate(edit, { onSuccess: onDone, onError: onErr });
      }
    } else if (kind === "event") {
      postEvent.mutate(
        {
          ...fields,
          eventId: subjectId,
          photos: uploaded.length ? uploaded : undefined,
        },
        { onSuccess: onDone, onError: onErr },
      );
    } else {
      postPlace.mutate(
        { ...fields, photos: uploaded.length ? uploaded : undefined },
        { onSuccess: onDone, onError: onErr },
      );
    }
  }

  const busy = uploading || post.isPending || update.isPending;
  const paused = post.isPaused || update.isPaused;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      onDismiss={onDismiss}
      title={isEditing ? "Edit your review" : "Write a review"}
      footer={
        <View className="gap-2">
          {paused ? <QueuedWriteNotice /> : null}
          <Button
            title={
              uploading
                ? "Uploading photos…"
                : paused
                  ? QUEUED_WRITE_LABEL
                  : busy
                    ? "Saving…"
                    : isEditing
                      ? "Save changes"
                      : "Post review"
            }
            onPress={submit}
            disabled={busy}
          />
        </View>
      }
    >
      <View className="gap-4">
        <AppText variant="muted" numberOfLines={2}>
          How was {subjectTitle}?
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
            Photos (optional) · {photoCount}/{MAX_REVIEW_PHOTOS}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 py-1"
          >
            {existingPhotos.map((p) => (
              <View key={p.id}>
                <Image
                  source={{
                    uri: buildCloudinaryUrl(p.public_id, p.version, {
                      width: 160,
                      height: 160,
                    }),
                  }}
                  style={{ width: 76, height: 76, borderRadius: 8 }}
                  contentFit="cover"
                />
                <Pressable
                  onPress={() => removeExisting(p.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5"
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Icon name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {newPhotos.map((uri) => (
              <View key={uri}>
                <Image
                  source={{ uri }}
                  style={{ width: 76, height: 76, borderRadius: 8 }}
                  contentFit="cover"
                />
                <Pressable
                  onPress={() => removeNew(uri)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5"
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Icon name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photoCount < MAX_REVIEW_PHOTOS ? (
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
