import {
  MAX_CONTENT_IMAGE_BYTES,
  MAX_CONTENT_VIDEO_BYTES,
  MIN_VIDEO_SECONDS,
} from "@abonten/core/content/limits";
import { logger } from "@abonten/core/logger";
import {
  ALLOWED_IMAGE_UPLOAD_FORMATS,
  ALLOWED_VIDEO_UPLOAD_FORMATS,
} from "@abonten/core/uploadLimits";
import {
  buildEagerTransformations,
  shouldOptimizeVideo,
} from "@abonten/core/videoDelivery";
import type { ContentMediaItem } from "@abonten/types/contentType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { RegisterContentMediaInput } from "@abonten/validation/contentSchemas";
import { v2 as cloudinary } from "cloudinary";
import { enqueueCloudinaryCleanup } from "../platform/cloudinaryCleanupCore";
import { checkRateLimit } from "../security/rateLimit";
import { CONTENT_MEDIA_FOLDER_PREFIX } from "../uploads/cloudinaryUploadSignature";
import { readContentSettings, resolveContentAccess } from "./contentProgram";
import { type Envelope, FAIL, accountIsRestricted } from "./contentShared";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// The media half of the content pipeline. The bytes go browser/app ->
// Cloudinary with a signature bound to `content_media/<user id>`; this
// registers the upload as a content_media row. Unlike the highlight flow, it
// never trusts the client's bytes, duration, dimensions or format: it asks
// Cloudinary's Admin API for the stored asset's own record and applies the
// limits to that. Video renditions are requested asynchronously; a failure
// there never blocks viewing (the original is always playable).

const MAX_REGISTRATIONS_PER_HOUR = 120;

type CloudinaryResource = {
  public_id: string;
  version: number;
  format?: string;
  resource_type: "image" | "video" | "raw";
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  secure_url: string;
};

function isAllowedFormat(format: string | undefined, video: boolean): boolean {
  if (!format) return false;
  const list = (
    video ? ALLOWED_VIDEO_UPLOAD_FORMATS : ALLOWED_IMAGE_UPLOAD_FORMATS
  )
    .split(",")
    .map((f) => f.trim().toLowerCase());
  return list.includes(format.toLowerCase());
}

export function mapMediaRow(row: {
  id: string;
  media_type: string;
  public_id: string;
  version: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  media_url: string;
  playback_url: string | null;
  poster_url: string | null;
  thumbnail_url: string | null;
  status: string;
  playback_status: string;
  position: number;
}): ContentMediaItem {
  return {
    id: row.id,
    type: row.media_type as "image" | "video",
    publicId: row.public_id,
    version: Number(row.version),
    width: row.width,
    height: row.height,
    durationSeconds:
      row.duration_seconds === null ? null : Number(row.duration_seconds),
    mediaUrl: row.media_url,
    playbackUrl: row.playback_url,
    posterUrl: row.poster_url,
    thumbnailUrl: row.thumbnail_url,
    status: row.status as ContentMediaItem["status"],
    playbackStatus: row.playback_status as ContentMediaItem["playbackStatus"],
    position: row.position,
  };
}

async function fetchResource(
  publicId: string,
  resourceType: "image" | "video",
): Promise<CloudinaryResource | null> {
  try {
    const res = (await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
      type: "upload",
    })) as CloudinaryResource;
    return res;
  } catch (error) {
    logger.error(
      `content media: Cloudinary resource lookup failed for ${publicId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

async function requestRendition(
  publicId: string,
  trim: { start: number; end: number } | null,
): Promise<{
  playbackUrl: string | null;
  posterUrl: string | null;
  ok: boolean;
}> {
  try {
    const result = await cloudinary.uploader.explicit(publicId, {
      resource_type: "video",
      type: "upload",
      eager: buildEagerTransformations(trim ?? undefined),
      eager_async: true,
      invalidate: false,
    });
    const eager = (result?.eager ?? []) as { secure_url?: string }[];
    return {
      playbackUrl: eager[0]?.secure_url ?? null,
      posterUrl: eager[1]?.secure_url ?? null,
      ok: true,
    };
  } catch (error) {
    logger.error(
      `content media: rendition request failed for ${publicId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { playbackUrl: null, posterUrl: null, ok: false };
  }
}

/**
 * Whether this person may be given a Cloudinary signature for Spotlight /
 * Story media at all. A signature authorises a real upload against the
 * account's storage, so it is only handed to people who could post.
 */
export async function canUploadContentMedia(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  const { program } = await resolveContentAccess(supabase, userId);
  if (!program.spotlightPosting && !program.storiesPosting) return false;
  return !(await accountIsRestricted(supabase, userId));
}

/**
 * An upload that registration refused is removed from Cloudinary straight
 * away (queued for the maintenance drain if that call fails), so a refused
 * file never keeps using storage.
 */
async function discardUpload(
  supabase: ServiceRoleClient,
  resource: CloudinaryResource,
): Promise<void> {
  const type = resource.resource_type === "video" ? "video" : "image";
  try {
    await cloudinary.uploader.destroy(resource.public_id, {
      resource_type: type,
      invalidate: true,
    });
  } catch (error) {
    logger.error(
      `content media: discarding refused upload ${resource.public_id} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await enqueueCloudinaryCleanup(supabase, resource.public_id, type);
  }
}

export async function registerContentMediaCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: RegisterContentMediaInput,
): Promise<Envelope<ContentMediaItem>> {
  const { program } = await resolveContentAccess(supabase, userId);
  const allowed =
    input.kind === "spotlight"
      ? program.spotlightPosting
      : program.storiesPosting;
  if (!allowed) {
    return {
      status: 403,
      message: "Posting isn't available for your account yet.",
    };
  }
  if (await accountIsRestricted(supabase, userId)) {
    return { status: 403, message: "Your account has been restricted." };
  }
  if (
    !(await checkRateLimit(
      `content-media:${userId}`,
      MAX_REGISTRATIONS_PER_HOUR,
      3600,
    ))
  ) {
    return {
      status: 429,
      message: "Too many uploads. Please try again later.",
    };
  }

  const expectedPrefix = `${CONTENT_MEDIA_FOLDER_PREFIX}/${userId}/`;
  if (!input.publicId.startsWith(expectedPrefix)) {
    return { status: 403, message: "Not authorized for this media." };
  }

  // Idempotent: the same upload registered twice returns the same row.
  const { data: existing } = await supabase
    .from("content_media")
    .select("*")
    .eq("public_id", input.publicId)
    .maybeSingle();
  if (existing) {
    if (existing.owner_id !== userId) {
      return { status: 403, message: "Not authorized for this media." };
    }
    return { status: 200, data: mapMediaRow(existing) };
  }

  const resource = await fetchResource(input.publicId, input.resourceType);
  if (!resource) {
    return {
      status: 400,
      message: "We couldn't find that upload. Please try uploading again.",
    };
  }
  const isVideo = resource.resource_type === "video";
  const refuse = async (
    message: string,
  ): Promise<Envelope<ContentMediaItem>> => {
    await discardUpload(supabase, resource);
    return { status: 400, message };
  };
  if (
    resource.resource_type === "raw" ||
    isVideo !== (input.resourceType === "video")
  ) {
    return refuse("Unsupported media type.");
  }
  if (!isAllowedFormat(resource.format, isVideo)) {
    return refuse("Unsupported file format.");
  }
  if (
    resource.bytes >
    (isVideo ? MAX_CONTENT_VIDEO_BYTES : MAX_CONTENT_IMAGE_BYTES)
  ) {
    return refuse("That file is too large.");
  }

  const settings = await readContentSettings(supabase);
  const maxSeconds =
    input.kind === "spotlight"
      ? (settings?.spotlight_video_max_seconds ?? 90)
      : (settings?.story_video_max_seconds ?? 60);

  let durationSeconds: number | null = null;
  let trim: { start: number; end: number } | null = null;
  let mediaUrl = resource.secure_url;
  if (isVideo) {
    const full =
      typeof resource.duration === "number" ? resource.duration : null;
    if (full !== null && full < MIN_VIDEO_SECONDS) {
      return refuse("That video is too short.");
    }
    const start = input.trimStartSeconds;
    const end = input.trimEndSeconds;
    if (
      typeof start === "number" &&
      typeof end === "number" &&
      end > start &&
      (full === null || end <= full + 0.5) &&
      !(start <= 0.05 && full !== null && end >= full - 0.05)
    ) {
      trim = { start, end };
      durationSeconds = end - start;
      mediaUrl = cloudinary.url(resource.public_id, {
        resource_type: "video",
        version: resource.version,
        format: resource.format,
        start_offset: start,
        end_offset: end,
        secure: true,
      });
    } else {
      durationSeconds = full;
    }
    if (durationSeconds !== null && durationSeconds > maxSeconds + 0.5) {
      return refuse(
        `Videos can be at most ${maxSeconds} seconds. Trim it and try again.`,
      );
    }
  }

  const thumbnailUrl = isVideo
    ? cloudinary.url(resource.public_id, {
        resource_type: "video",
        format: "jpg",
        version: resource.version,
        transformation: [{ width: 480, height: 854, crop: "fill" }],
        secure: true,
        ...(trim ? { start_offset: trim.start } : {}),
      })
    : cloudinary.url(resource.public_id, {
        resource_type: "image",
        version: resource.version,
        transformation: [
          {
            width: 480,
            height: 854,
            crop: "limit",
            quality: "auto",
            fetch_format: "auto",
          },
        ],
        secure: true,
      });

  let playbackUrl: string | null = null;
  let posterUrl: string | null = null;
  let playbackStatus: ContentMediaItem["playbackStatus"] = "none";
  if (
    isVideo &&
    shouldOptimizeVideo({
      width: resource.width,
      height: resource.height,
      bytes: resource.bytes,
      durationSeconds,
    })
  ) {
    const rendition = await requestRendition(resource.public_id, trim);
    playbackUrl = rendition.playbackUrl;
    posterUrl = rendition.posterUrl;
    playbackStatus =
      rendition.ok && rendition.playbackUrl ? "pending" : "failed";
  }

  const { data: inserted, error } = await supabase
    .from("content_media")
    .insert({
      owner_id: userId,
      media_type: isVideo ? "video" : "image",
      public_id: resource.public_id,
      version: resource.version,
      format: resource.format ?? null,
      bytes: resource.bytes,
      width: resource.width ?? null,
      height: resource.height ?? null,
      duration_seconds: durationSeconds,
      media_url: mediaUrl,
      playback_url: playbackUrl,
      poster_url: posterUrl,
      thumbnail_url: thumbnailUrl,
      status: "ready",
      playback_status: playbackStatus,
      trim_start_seconds: trim?.start ?? null,
      trim_end_seconds: trim?.end ?? null,
    })
    .select("*")
    .single();
  if (error || !inserted) {
    if (error?.code === "23505") {
      const { data: again } = await supabase
        .from("content_media")
        .select("*")
        .eq("public_id", input.publicId)
        .maybeSingle();
      if (again && again.owner_id === userId) {
        return { status: 200, data: mapMediaRow(again) };
      }
    }
    logger.error(`registerContentMediaCore insert failed: ${error?.message}`);
    return FAIL;
  }
  return { status: 200, data: mapMediaRow(inserted) };
}

/** Owner deletes an upload that was never attached to a post. */
export async function deleteContentMediaCore(
  supabase: ServiceRoleClient,
  userId: string,
  mediaId: string,
): Promise<Envelope> {
  const { data: row } = await supabase
    .from("content_media")
    .select("id, owner_id, post_id, public_id, media_type, status")
    .eq("id", mediaId)
    .maybeSingle();
  if (!row || row.owner_id !== userId) {
    return { status: 404, message: "Media not found." };
  }
  if (row.post_id) {
    return {
      status: 409,
      message: "This media belongs to a post. Delete the post instead.",
    };
  }
  try {
    await cloudinary.uploader.destroy(row.public_id, {
      resource_type: row.media_type as "image" | "video",
    });
  } catch (error) {
    logger.error(`content media destroy failed for ${row.public_id}: ${error}`);
    await enqueueCloudinaryCleanup(
      supabase,
      row.public_id,
      row.media_type === "video" ? "video" : "image",
    );
  }
  await supabase.from("content_media").delete().eq("id", mediaId);
  return { status: 200, message: "Removed." };
}

/**
 * Re-request the optimised rendition for one video (owner or staff). Never
 * touches the original; a viewer keeps playing the original meanwhile.
 */
export async function retryContentMediaProcessingCore(
  supabase: ServiceRoleClient,
  mediaId: string,
  actor: { userId: string; staff: boolean },
): Promise<Envelope<ContentMediaItem>> {
  const { data: row } = await supabase
    .from("content_media")
    .select("*")
    .eq("id", mediaId)
    .maybeSingle();
  if (!row || (!actor.staff && row.owner_id !== actor.userId)) {
    return { status: 404, message: "Media not found." };
  }
  if (row.media_type !== "video" || row.status === "deleted") {
    return { status: 400, message: "Nothing to process." };
  }
  const trim =
    row.trim_start_seconds !== null && row.trim_end_seconds !== null
      ? {
          start: Number(row.trim_start_seconds),
          end: Number(row.trim_end_seconds),
        }
      : null;
  const rendition = await requestRendition(row.public_id, trim);
  const { data: updated, error } = await supabase
    .from("content_media")
    .update({
      playback_url: rendition.playbackUrl ?? row.playback_url,
      poster_url: rendition.posterUrl ?? row.poster_url,
      playback_status:
        rendition.ok && rendition.playbackUrl ? "pending" : "failed",
      failure_reason: rendition.ok ? null : "Rendition request failed",
    })
    .eq("id", mediaId)
    .select("*")
    .single();
  if (error || !updated) return FAIL;
  return { status: 200, data: mapMediaRow(updated) };
}

/**
 * Confirms a rendition exists (a HEAD on the playback URL): flips
 * playback_status pending -> ready. Called lazily by the post read path so
 * the status converges without a Cloudinary webhook.
 */
export async function confirmPendingRenditionsCore(
  supabase: ServiceRoleClient,
  mediaIds: string[],
): Promise<void> {
  if (mediaIds.length === 0) return;
  const { data: rows } = await supabase
    .from("content_media")
    .select("id, playback_url, playback_status, updated_at")
    .in("id", mediaIds)
    .eq("playback_status", "pending");
  for (const row of rows ?? []) {
    if (!row.playback_url) continue;
    try {
      const res = await fetch(row.playback_url, { method: "HEAD" });
      if (res.ok) {
        await supabase
          .from("content_media")
          .update({ playback_status: "ready" })
          .eq("id", row.id);
      } else if (
        res.status !== 423 &&
        Date.now() - Date.parse(row.updated_at) > 6 * 60 * 60 * 1000
      ) {
        await supabase
          .from("content_media")
          .update({
            playback_status: "failed",
            failure_reason: `HTTP ${res.status}`,
          })
          .eq("id", row.id);
      }
    } catch {
      // Network hiccup: try again on the next read.
    }
  }
}
