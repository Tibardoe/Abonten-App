"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Cloudinary has no "audio" resource type — audio assets are stored (and
// must be destroyed) under "video", same as uploadHighlight.ts's upload options.
function toCloudinaryResourceType(mediaType: string): "image" | "video" {
  return mediaType === "image" ? "image" : "video";
}

export async function deleteHighlight(groupId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not Logged in" };
  }

  const { data: rows, error: fetchError } = await supabase
    .from("highlight")
    .select("id, public_id, media_type")
    .eq("group_id", groupId)
    .eq("user_id", user.id);

  if (fetchError || !rows || rows.length === 0) {
    return {
      status: 404,
      message: "Highlight not found or unauthorized",
    };
  }

  // Clean up Cloudinary before touching the database: a slide's row is only
  // removed once its media is confirmed gone (or it's a legacy row with no
  // public_id to clean), so a Cloudinary failure never orphans an asset we
  // could otherwise still find.
  const deletableIds: string[] = [];
  let failedCount = 0;

  for (const row of rows) {
    if (!row.public_id) {
      // Legacy row from before public_id was tracked — nothing to clean up.
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
    .eq("user_id", user.id); // ownership enforced in the delete query itself

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete highlight: ${deleteError.message}`,
    };
  }

  if (failedCount > 0) {
    return {
      status: 500,
      message: `Deleted ${deletableIds.length} slide(s), but ${failedCount} could not be removed. Try deleting the remaining slide(s) again.`,
    };
  }

  return { status: 200, message: "Highlight deleted successfully" };
}
