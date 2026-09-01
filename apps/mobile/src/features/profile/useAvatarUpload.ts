import { useSession } from "@/auth/SessionProvider";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";

// Native echo of the web avatar flow (getAvatarUploadSignature +
// saveAvatarToSupabase): pick a square image, upload it straight to
// Cloudinary with a short-lived signature (see src/lib/cloudinaryUpload.ts),
// then write the new public_id / version to `user_info` (RLS self-update).
// The `user_image_history` row the web action also writes is left to the
// server — that table has no client INSERT policy.

export function useAvatarUpload() {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async () => {
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
      );

      if (!userId) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("user_info")
        .update({ avatar_public_id: publicId, avatar_version: version })
        .eq("id", userId);
      if (error) throw error;

      return { publicId, version };
    },
    onSuccess: (result) => {
      if (!result) return;
      qc.invalidateQueries({ queryKey: ["mobile", "profile"] });
      qc.invalidateQueries({ queryKey: ["profile", "public"] });
    },
  });
}
