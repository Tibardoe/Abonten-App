import { supabase } from "@/config/supabase/client";
import {
  MESSAGE_ATTACHMENTS_BUCKET,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_ATTACHMENT_MIME_TYPES,
  type SendMessageAttachmentInput,
} from "@abonten/types/messagingType";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.72;

export type StagedAttachment = {
  // Object URL for an instant optimistic preview.
  previewUrl: string;
  blob: Blob;
  width: number;
  height: number;
};

export function isAcceptableChatImage(file: File): string | null {
  if (
    !(MESSAGE_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)
  ) {
    return "Choose a JPG, PNG or WebP image.";
  }
  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
    return "That image is over 10 MB. Choose a smaller one.";
  }
  return null;
}

// Downscale a picked image to a chat-sized JPEG in the browser. Falls back to
// the original file if the canvas path fails — the server still enforces the
// 10 MB / MIME limits on the stored object.
export async function stageChatImage(file: File): Promise<StagedAttachment> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      MAX_EDGE / bitmap.width,
      MAX_EDGE / bitmap.height,
      1,
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("toBlob failed");

    return { previewUrl: URL.createObjectURL(blob), blob, width, height };
  } catch {
    return {
      previewUrl: URL.createObjectURL(file),
      blob: file,
      width: 0,
      height: 0,
    };
  }
}

// Upload a staged image to the PRIVATE message-attachments bucket. The object
// path MUST be `<conversationId>/<uuid>.jpg` — both the storage RLS policy
// and send_message's prefix check key on it.
export async function uploadChatAttachment(
  conversationId: string,
  staged: StagedAttachment,
): Promise<SendMessageAttachmentInput> {
  const path = `${conversationId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .upload(path, staged.blob, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (error) throw error;

  return {
    storagePath: path,
    fileName: null,
    mimeType: "image/jpeg",
    fileSize: staged.blob.size,
    width: staged.width || null,
    height: staged.height || null,
  };
}
