import { useSession } from "@/auth/SessionProvider";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import { supabase } from "@/lib/supabase";
import { logger } from "@abonten/core/logger";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";

// Native echo of the web avatar flow (getAvatarUploadSignature +
// saveAvatarToSupabase): pick a square image, upload it straight to
// Cloudinary with a short-lived signature (see src/lib/cloudinaryUpload.ts),
// then write the new public_id / version to `user_info` (RLS self-update).
// The `user_image_history` row is written here too (owner INSERT policy
// added in migration 20260909115349), so mobile and web keep the same trail.

export function useAvatarUpload() {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (opts?: {
      /** Real byte progress (0..1) so the screen can show a bar. */
      onProgress?: (fraction: number) => void;
      /** Bytes are in; what remains is the `user_info` write. */
      onUploadComplete?: () => void;
    }) => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        throw new Error("Photo access is needed to change your picture.");
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (picked.canceled || !picked.assets?.[0]) return null;

      const { publicId, version } = await uploadToCloudinary(
        picked.assets[0].uri,
        "avatar",
        { onProgress: opts?.onProgress },
      );
      opts?.onUploadComplete?.();

      if (!userId) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("user_info")
        .update({ avatar_public_id: publicId, avatar_version: String(version) })
        .eq("id", userId);
      if (error) throw error;

      // Same history row the web action writes, so a photo changed on mobile
      // is recorded like one changed on web (migration 20260909115349 added
      // the owner INSERT policy this needs). Best-effort: the avatar is
      // already live at this point, and a bookkeeping failure must not report
      // the change as failed — that was the web bug this parity fix followed.
      const { error: historyError } = await supabase
        .from("user_image_history")
        .insert({
          user_id: userId,
          public_id: publicId,
          version: String(version),
        });
      if (historyError) {
        logger.error(
          `useAvatarUpload: failed to record image history: ${historyError.message}`,
        );
      }

      return { publicId, version };
    },
    onSuccess: (result) => {
      if (!result) return;
      qc.invalidateQueries({ queryKey: ["mobile", "profile"] });
      qc.invalidateQueries({ queryKey: ["profile", "public"] });
    },
  });
}
