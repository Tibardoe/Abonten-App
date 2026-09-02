import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Post-auth bodies of deleteHighlight.ts / deleteHighlightSlide.ts, lifted
// so the mobile highlight-delete routes run the same Cloudinary-first
// cleanup. The web actions are thinned to createClient + auth + delegate.
// Upload stays client-side on mobile (the highlight_owner_insert RLS lets a
// signed-in user insert their own rows, and the browser->Cloudinary upload
// is already signed); only delete needs the server because destroying a
// Cloudinary asset needs CLOUDINARY_API_SECRET.

// Cloudinary has no "audio" resource type — audio assets are stored (and
// must be destroyed) under "video", same as uploadHighlight.ts's options.
function toCloudinaryResourceType(mediaType: string): "image" | "video" {
  return mediaType === "image" ? "image" : "video";
}

export type DeleteHighlightCoreResult = {
  status: 200 | 401 | 404 | 500;
  message: string;
};

export async function deleteHighlightGroupCore(
  supabase: SupabaseClient,
  userId: string,
  groupId: string,
): Promise<DeleteHighlightCoreResult> {
  const { data: rows, error: fetchError } = await supabase
    .from("highlight")
    .select("id, public_id, media_type")
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (fetchError || !rows || rows.length === 0) {
    return { status: 404, message: "Highlight not found or unauthorized" };
  }

  // Clean up Cloudinary before touching the database: a slide's row is only
  // removed once its media is confirmed gone (or it's a legacy row with no
  // public_id to clean), so a Cloudinary failure never orphans an asset we
  // could otherwise still find.
  const deletableIds: string[] = [];
  let failedCount = 0;

  for (const row of rows) {
    if (!row.public_id) {
      deletableIds.push(row.id);
      continue;
    }
    try {
      const result = await cloudinary.uploader.destroy(row.public_id, {
        resource_type: toCloudinaryResourceType(row.media_type),
      });
      if (result.result === "ok" || result.result === "not found") {
        deletableIds.push(row.id);
      } else {
        logger.error("Cloudinary destroy returned unexpected result:", result);
        failedCount += 1;
      }
    } catch (cloudError) {
      logger.error("Cloudinary deletion failed:", cloudError);
      failedCount += 1;
    }
  }

  if (deletableIds.length === 0) {
    return {
      status: 500,
      message: "Failed to delete highlight media. Please try again.",
    };
  }

  const { error: deleteError } = await supabase
    .from("highlight")
    .delete()
    .in("id", deletableIds)
    .eq("user_id", userId);

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete highlight: ${deleteError.message}`,
    };
  }

  if (failedCount > 0) {
    return {
      status: 500,
      message: `Deleted ${deletableIds.length} slide(s), but ${failedCount} could not be removed. Try again.`,
    };
  }

  return { status: 200, message: "Highlight deleted successfully" };
}

export async function deleteHighlightSlideCore(
  supabase: SupabaseClient,
  userId: string,
  slideId: string,
): Promise<DeleteHighlightCoreResult> {
  const { data: row, error: fetchError } = await supabase
    .from("highlight")
    .select("id, public_id, media_type")
    .eq("id", slideId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !row) {
    return { status: 404, message: "Slide not found or unauthorized" };
  }

  if (row.public_id) {
    try {
      const result = await cloudinary.uploader.destroy(row.public_id, {
        resource_type: toCloudinaryResourceType(row.media_type),
      });
      if (result.result !== "ok" && result.result !== "not found") {
        logger.error("Cloudinary destroy returned unexpected result:", result);
        return {
          status: 500,
          message: "Failed to delete slide media. Please try again.",
        };
      }
    } catch (cloudError) {
      logger.error("Cloudinary deletion failed:", cloudError);
      return {
        status: 500,
        message: "Failed to delete slide media. Please try again.",
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("highlight")
    .delete()
    .eq("id", slideId)
    .eq("user_id", userId);

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete slide: ${deleteError.message}`,
    };
  }

  return { status: 200, message: "Slide deleted successfully" };
}
