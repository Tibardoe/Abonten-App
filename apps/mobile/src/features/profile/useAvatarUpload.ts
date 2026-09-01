import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";

// Native echo of the web avatar flow (getAvatarUploadSignature +
// saveAvatarToSupabase): pick a square image, upload it straight to
// Cloudinary with a short-lived signature from /api/mobile/uploads/signature
// (the API secret never leaves the server; the folder is bound to the user
// id), then write the new public_id / version to `user_info` (RLS
// self-update). The `user_image_history` row the web action also writes is
// left to the server — that table has no client INSERT policy.

const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;

type CloudinaryUploadResponse = {
  public_id: string;
  version: number;
  secure_url: string;
};

async function uploadToCloudinary(uri: string): Promise<{
  publicId: string;
  version: number;
}> {
  const sig = await api.uploads.signature("avatar");
  if (sig.status !== 200 || !sig.data) {
    throw new Error(sig.message ?? "Could not authorize the upload.");
  }
  const { timestamp, signature, apiKey, cloudName, folder } = sig.data;
  const cloud = cloudName ?? CLOUDINARY_CLOUD_NAME;
  if (!cloud) throw new Error("Cloudinary is not configured.");

  const form = new FormData();
  form.append("file", {
    uri,
    name: "avatar.jpg",
    type: "image/jpeg",
    // biome-ignore lint/suspicious/noExplicitAny: RN FormData file part
  } as any);
  form.append("api_key", String(apiKey ?? ""));
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    throw new Error("The image upload failed. Please try again.");
  }
  const json = (await res.json()) as CloudinaryUploadResponse;
  return { publicId: json.public_id, version: json.version };
}

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
