import { supabase } from "@/lib/supabase";
import { uuidv4 } from "@/lib/uuid";
import type { SendMessageAttachmentInput } from "@abonten/types/messagingType";
import { MESSAGE_ATTACHMENTS_BUCKET } from "@abonten/types/messagingType";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

// Longest edge we keep for a chat photo — enough for a full-screen view on a
// modern phone, small enough to send fast on a Ghanaian mobile connection.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

export type StagedAttachment = {
  // Local file:// URI of the downscaled JPEG, shown as an optimistic preview.
  uri: string;
  width: number;
  height: number;
};

// Pick one image from the library and downscale/re-encode it locally. Returns
// null if the user cancelled. Throws with a user-facing message if permission
// is denied.
export async function pickChatImage(): Promise<StagedAttachment | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Photo access is needed to send a picture.");
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  const asset = picked.canceled ? null : picked.assets?.[0];
  if (!asset) return null;

  const srcW = asset.width ?? MAX_EDGE;
  const srcH = asset.height ?? MAX_EDGE;
  const resize =
    srcW >= srcH
      ? { width: Math.min(srcW, MAX_EDGE) }
      : { height: Math.min(srcH, MAX_EDGE) };

  try {
    const ref = await ImageManipulator.manipulate(asset.uri)
      .resize(resize)
      .renderAsync();
    const saved = await ref.saveAsync({
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return { uri: saved.uri, width: saved.width, height: saved.height };
  } catch {
    // Fall back to the original if manipulation fails — the server still
    // enforces the 10 MB / MIME limits on the stored object.
    return { uri: asset.uri, width: srcW, height: srcH };
  }
}

// Upload a staged image to the PRIVATE message-attachments bucket. The object
// path MUST be `<conversationId>/<uuid>.jpg` — both the storage RLS policy
// (folder[1] must be a conversation the caller is in) and send_message's
// prefix check key on it. Returns the attachment descriptor to hand to
// api.messaging.send.
export async function uploadChatAttachment(
  conversationId: string,
  staged: StagedAttachment,
): Promise<SendMessageAttachmentInput> {
  const path = `${conversationId}/${uuidv4()}.jpg`;

  // fetch() on a file:// URI is the supported Expo route to bytes for
  // supabase-js (no extra base64 dependency).
  const res = await fetch(staged.uri);
  const bytes = await res.arrayBuffer();

  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;

  return {
    storagePath: path,
    fileName: null,
    mimeType: "image/jpeg",
    fileSize: bytes.byteLength,
    width: staged.width,
    height: staged.height,
  };
}
