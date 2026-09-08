import { supabase } from "@/lib/supabase";
import { uuidv4 } from "@/lib/uuid";
import { MESSAGE_ATTACHMENTS_BUCKET } from "@abonten/types/messagingType";
import type { SendMessageAttachmentInput } from "@abonten/types/messagingType";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

// `expo-document-picker` calls `requireNativeModule` at import time; load it
// lazily so a client that hasn't been rebuilt since it was added fails only
// on "Choose File" (caught + shown as an alert) rather than at module load.
type DocumentPickerModule = typeof import("expo-document-picker");
function getDocumentPicker(): DocumentPickerModule {
  return require("expo-document-picker") as DocumentPickerModule;
}

// Longest edge we keep for a chat photo — enough for a full-screen view on a
// modern phone, small enough to send fast on a Ghanaian mobile connection.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;
export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // matches the bucket

export type StagedAttachmentKind = "image" | "video" | "file" | "audio";

export type StagedAttachment = {
  // Local file:// URI, shown as an optimistic preview before the upload.
  uri: string;
  kind: StagedAttachmentKind;
  mimeType: string;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  fileSize?: number | null;
};

// ── permission errors carry a `settings` flag so the caller can offer a
//    "Open Settings" action rather than a dead end (task §20).
export class AttachmentPermissionError extends Error {
  readonly settings = true;
  constructor(message: string) {
    super(message);
    this.name = "AttachmentPermissionError";
  }
}

// ── pickers ──────────────────────────────────────────────────────────

async function downscaleImage(asset: {
  uri: string;
  width?: number;
  height?: number;
}): Promise<StagedAttachment> {
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
    return {
      uri: saved.uri,
      kind: "image",
      mimeType: "image/jpeg",
      width: saved.width,
      height: saved.height,
    };
  } catch {
    // Fall back to the original — the server still enforces the size / MIME
    // limits on the stored object.
    return {
      uri: asset.uri,
      kind: "image",
      mimeType: "image/jpeg",
      width: srcW,
      height: srcH,
    };
  }
}

function stageVideoAsset(
  asset: ImagePicker.ImagePickerAsset,
): StagedAttachment {
  return {
    uri: asset.uri,
    kind: "video",
    mimeType: asset.mimeType ?? "video/mp4",
    fileName: asset.fileName ?? "video.mp4",
    width: asset.width ?? null,
    height: asset.height ?? null,
    durationSeconds: asset.duration ? asset.duration / 1000 : null,
    fileSize: asset.fileSize ?? null,
  };
}

/** Legacy single-image picker used by the composer's quick multi-photo
 *  strip. Returns null if the user cancelled. */
export async function pickChatImage(): Promise<StagedAttachment | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new AttachmentPermissionError(
      "Photo access is needed to send a picture.",
    );
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  const asset = picked.canceled ? null : picked.assets?.[0];
  if (!asset) return null;
  return downscaleImage(asset);
}

/** Photos & Videos from the attachment sheet. Multi-select is allowed;
 *  images are downscaled, a video is staged as-is (sent as a `file`). */
export async function pickChatMedia(limit = 4): Promise<StagedAttachment[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new AttachmentPermissionError(
      "Photo and video access is needed to send media.",
    );
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.length) return [];
  return Promise.all(
    picked.assets
      .slice(0, limit)
      .map((a) =>
        a.type === "video" ? stageVideoAsset(a) : downscaleImage(a),
      ),
  );
}

/** Take Photo — a single capture from the camera. */
export async function captureChatPhoto(): Promise<StagedAttachment | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new AttachmentPermissionError(
      "Camera access is needed to take a photo.",
    );
  }
  const shot = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  const asset = shot.canceled ? null : shot.assets?.[0];
  if (!asset) return null;
  return downscaleImage(asset);
}

const BLOCKED_DOC_EXT = /\.(apk|exe|bat|cmd|sh|msi|scr|com|jar|app|dmg)$/i;

/** Choose File — the platform document picker, with a size + type guard. */
export async function pickChatDocument(): Promise<StagedAttachment | null> {
  const res = await getDocumentPicker().getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = res.canceled ? null : res.assets?.[0];
  if (!asset) return null;
  if (asset.name && BLOCKED_DOC_EXT.test(asset.name)) {
    throw new Error("That file type can't be sent.");
  }
  if (asset.size != null && asset.size > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new Error("That file is larger than the 10 MB limit.");
  }
  const mime = asset.mimeType ?? "application/octet-stream";
  return {
    uri: asset.uri,
    kind: mime.startsWith("image/")
      ? "image"
      : mime.startsWith("video/")
        ? "video"
        : mime.startsWith("audio/")
          ? "audio"
          : "file",
    mimeType: mime,
    fileName: asset.name ?? "file",
    fileSize: asset.size ?? null,
  };
}

// ── upload ───────────────────────────────────────────────────────────

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "audio/wav": "wav",
};

function extFor(staged: StagedAttachment): string {
  if (EXT_BY_MIME[staged.mimeType]) return EXT_BY_MIME[staged.mimeType];
  const fromName = staged.fileName?.match(/\.([a-z0-9]{1,8})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const fromUri = staged.uri.match(/\.([a-z0-9]{1,8})(?:\?|$)/i)?.[1];
  return fromUri?.toLowerCase() ?? "bin";
}

// Upload a staged attachment to the PRIVATE message-attachments bucket. The
// object path MUST be `<conversationId>/<uuid>.<ext>` — both the storage RLS
// policy (folder[1] must be a conversation the caller is in) and
// send_message's prefix check key on it. Returns the descriptor to hand to
// api.messaging.send.
export async function uploadChatAttachment(
  conversationId: string,
  staged: StagedAttachment,
): Promise<SendMessageAttachmentInput> {
  const path = `${conversationId}/${uuidv4()}.${extFor(staged)}`;

  // fetch() on a file:// URI is the supported Expo route to bytes for
  // supabase-js (no extra base64 dependency).
  const res = await fetch(staged.uri);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new Error("That file is larger than the 10 MB limit.");
  }
  if (staged.kind === "audio" && bytes.byteLength < 1500) {
    // A near-empty .m4a means nothing was captured — usually an emulator
    // with no working microphone, or the mic being held by another app.
    throw new Error(
      "The recording came through empty. Check that your microphone works.",
    );
  }

  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .upload(path, bytes, { contentType: staged.mimeType, upsert: false });
  if (error) throw error;

  return {
    storagePath: path,
    fileName: staged.fileName ?? null,
    mimeType: staged.mimeType,
    fileSize: bytes.byteLength,
    width: staged.width ?? null,
    height: staged.height ?? null,
    durationSeconds: staged.durationSeconds ?? null,
  };
}
