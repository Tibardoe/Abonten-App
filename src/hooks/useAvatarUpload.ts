"use client";

import { saveAvatarToCloudinary } from "@/actions/saveAvatarToCloudinary";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

type UseAvatarUploadOptions = {
  onSuccess?: () => void;
};

// Shared avatar upload mutation (size check, Cloudinary upload, notification,
// refresh) previously duplicated between the desktop and mobile avatar
// upload modals.
export function useAvatarUpload({ onSuccess }: UseAvatarUploadOptions = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { message: notification, showMessage } = useTimedMessage(3000);

  const { mutate, isPending } = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) {
        showMessage("Please select a photo!");
        return;
      }

      if (file.size > MAX_AVATAR_SIZE_BYTES) {
        showMessage("File is too large. Please upload an image under 5MB.");
        return;
      }

      try {
        await saveAvatarToCloudinary(file);
        showMessage("Upload successful!");
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
        console.error("Error uploading image:", error);
        showMessage("Upload failed. Please try again.");
      }
    },
  });

  return { uploadAvatar: mutate, isUploading: isPending, notification };
}
