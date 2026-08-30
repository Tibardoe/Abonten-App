"use client";

import getAvatarUploadSignature from "@/actions/getAvatarUploadSignature";
import { saveToSupabase } from "@/actions/saveAvatarToSupabase";
import { useToast } from "@/hooks/useToast";
import { uploadToCloudinary } from "@/utils/uploadToCloudinary";
import { logger } from "@abonten/core/logger";
import { MAX_AVATAR_UPLOAD_SIZE_BYTES } from "@abonten/core/uploadLimits";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type UseAvatarUploadOptions = {
  onSuccess?: () => void;
};

// Shared avatar upload mutation (size check, direct-to-Cloudinary upload
// with progress, Supabase record save, notification, refresh) previously
// duplicated between the desktop and mobile avatar upload modals. Uploads
// direct to Cloudinary (see getAvatarUploadSignature.ts) rather than through
// a Server Action, so real progress events are available -- the same
// pipeline useReviewPhotoUpload.ts already uses.
export function useAvatarUpload({ onSuccess }: UseAvatarUploadOptions = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [progress, setProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: async (file: File | null) => {
      setProgress(0);

      if (!file) {
        toast.error("Please select a photo!");
        return;
      }

      if (file.size > MAX_AVATAR_UPLOAD_SIZE_BYTES) {
        toast.error("File is too large. Please upload an image under 5MB.");
        return;
      }

      try {
        const signatureResponse = await getAvatarUploadSignature();

        if (signatureResponse.status !== 200 || !signatureResponse.data) {
          toast.error(signatureResponse.message ?? "Failed to start upload.");
          return;
        }

        const { timestamp, signature, apiKey, cloudName, folder } =
          signatureResponse.data;

        const { promise, xhr } = uploadToCloudinary({
          file,
          cloudName: cloudName as string,
          apiKey: apiKey as string,
          timestamp,
          signature,
          folder,
          resourceType: "image",
          onProgress: setProgress,
        });

        xhrRef.current = xhr;

        const result = await promise;
        const transformation = `${result.width}, ${result.height}`;

        await saveToSupabase(result.public_id, result.version, transformation);

        toast.success("Upload successful!");
        router.refresh();
        // No user id is threaded into this hook, so invalidate every
        // ["user-details", ...] / ["profile-completion", ...] entry rather
        // than one specific id — this is still a small, scoped predicate,
        // not an app-wide invalidation. A new avatar affects profile
        // completion (see src/utils/profileCompletion.ts).
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "user-details" ||
            query.queryKey[0] === "profile-completion",
        });
        onSuccess?.();
      } catch (error) {
        // A user-initiated cancel already rejects via xhr.onabort with this
        // message (see uploadToCloudinary.ts) — no error toast for that case.
        if (error instanceof Error && error.message === "Upload cancelled.") {
          return;
        }
        logger.error("Error uploading image:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Upload failed. Please try again.",
        );
      } finally {
        xhrRef.current = null;
      }
    },
  });

  const cancelUpload = () => {
    xhrRef.current?.abort();
  };

  return {
    uploadAvatar: mutate,
    isUploading: isPending,
    progress,
    cancelUpload,
  };
}
