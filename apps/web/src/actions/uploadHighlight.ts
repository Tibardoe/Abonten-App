"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import type { HighlightUploadMetadataItem } from "@abonten/types/highlightUploadType";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Cloudinary's free-tier non-chunked upload ceiling is 100MB; these mirror
// the client-side caps in HighlightModal.tsx and are re-checked here as
// defense-in-depth against a client that skips/bypasses that validation.
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The client-side editor lets a user trim a video, but the raw file itself
// is always uploaded unchanged -- so playback/delivery has to be the thing
// that respects the trim. Rather than a DB schema change, this builds a
// Cloudinary delivery URL with start_offset/end_offset baked in, so
// media_url (already a plain text column) simply points at the trimmed
// segment. Falls back to the untrimmed URL whenever the trim metadata is
// missing, inconsistent, or covers the full clip -- trimming is an
// enhancement, never something that should block a legitimate upload.
function resolveVideoDelivery(item: HighlightUploadMetadataItem): {
  mediaUrl: string;
  durationSeconds: number | null;
} {
  const fallback = {
    mediaUrl: item.secureUrl,
    durationSeconds: item.durationSeconds ?? null,
  };

  if (item.resourceType !== "video") return fallback;

  const {
    trimStartSeconds: start,
    trimEndSeconds: end,
    durationSeconds,
  } = item;

  const trimIsValid =
    typeof start === "number" &&
    typeof end === "number" &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end > start &&
    (typeof durationSeconds !== "number" || end <= durationSeconds + 0.5);

  if (!trimIsValid) return fallback;

  const isFullLength =
    start <= 0.05 &&
    typeof durationSeconds === "number" &&
    end >= durationSeconds - 0.05;

  if (isFullLength) return fallback;

  const format = item.secureUrl.split(/[?#]/)[0]?.split(".").pop();

  return {
    mediaUrl: cloudinary.url(item.publicId, {
      resource_type: "video",
      version: item.version,
      format,
      start_offset: start,
      end_offset: end,
      secure: true,
    }),
    durationSeconds: end - start,
  };
}

// The video bytes themselves never reach this action -- they go straight
// from the browser to Cloudinary (see uploadToCloudinary.ts +
// getHighlightUploadSignature.ts). This only ever receives small JSON
// metadata about an upload that already completed, which is what fixes the
// "Body exceeded 5mb limit" Server Action error for videos.
export default async function uploadHighlight(
  items: HighlightUploadMetadataItem[],
  groupId: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Sign in to upload highlight!" };
  }

  if (items.length === 0) {
    return { status: 400, message: "No media to upload" };
  }

  if (!UUID_PATTERN.test(groupId)) {
    return { status: 400, message: "Invalid upload batch" };
  }

  // The public_id's folder was bound to this user's id when the signature
  // was issued (see getHighlightUploadSignature.ts) -- a publicId outside
  // that folder means the metadata was tampered with client-side, since a
  // legitimate upload could never have landed anywhere else.
  const expectedFolderPrefix = `highlight_media/${user.id}/`;

  for (const item of items) {
    if (item.resourceType !== "image" && item.resourceType !== "video") {
      return { status: 400, message: "Unsupported media type" };
    }

    if (!item.publicId.startsWith(expectedFolderPrefix)) {
      return { status: 403, message: "Not authorized for this media" };
    }

    const maxBytes =
      item.resourceType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (item.bytes > maxBytes) {
      return { status: 400, message: "Media exceeds the maximum allowed size" };
    }
  }

  const results = await Promise.allSettled(
    items.map(async (item) => {
      // Deterministic thumbnail URL, built locally (no extra upload or
      // network round trip) from the public_id/version Cloudinary already
      // returned to the browser -- Cloudinary generates it on first request
      // and caches it, so no pre-processing is needed at upload time.
      const thumbnailUrl =
        item.resourceType === "video"
          ? cloudinary.url(item.publicId, {
              resource_type: "video",
              format: "jpg",
              version: item.version,
              transformation: [{ width: 300, height: 300, crop: "thumb" }],
              secure: true,
            })
          : null;

      const { mediaUrl, durationSeconds } = resolveVideoDelivery(item);

      const { error: dbError } = await supabase.from("highlight").insert({
        user_id: user.id,
        media_url: mediaUrl,
        media_type: item.resourceType,
        thumbnail_url: thumbnailUrl,
        media_duration: item.resourceType === "video" ? durationSeconds : null,
        group_id: groupId,
        public_id: item.publicId,
      });

      if (dbError) {
        await cleanupOrphanedAsset(item.publicId, item.resourceType);
        throw new Error(dbError.message);
      }
    }),
  );

  const failed = results.filter((r) => r.status === "rejected");

  if (failed.length > 0) {
    logger.error(
      "Upload failed for some media:",
      failed.map((f) => f.reason),
    );

    return {
      status: 500,
      message: `Uploaded ${items.length - failed.length}, failed ${failed.length}.`,
    };
  }

  return { status: 200, message: "Highlight uploaded successfully." };
}

// Called when a highlight's Cloudinary upload succeeded but the matching DB
// insert failed -- destroys the now-orphaned asset immediately (we're
// already in a live server request, no reason to defer). Only falls back to
// the queue table (drained opportunistically by cleanupOrphanedDraftAssets,
// see that file) if the immediate destroy call itself fails.
async function cleanupOrphanedAsset(
  publicId: string,
  resourceType: "image" | "video",
) {
  const supabase = await createClient();

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  } catch (cloudError) {
    logger.error(
      "Failed to immediately clean up orphaned highlight asset, queueing:",
      cloudError,
    );

    const { error: queueError } = await supabase
      .from("draft_asset_cleanup_queue")
      .insert({ public_id: publicId, resource_type: resourceType });

    if (queueError) {
      logger.error(
        "Failed to queue orphaned highlight asset for cleanup:",
        publicId,
        queueError,
      );
    }
  }
}
