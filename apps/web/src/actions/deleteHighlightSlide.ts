"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
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

export async function deleteHighlightSlide(slideId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not Logged in" };
  }

  const { data: row, error: fetchError } = await supabase
    .from("highlight")
    .select("id, public_id, media_type")
    .eq("id", slideId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !row) {
    return {
      status: 404,
      message: "Slide not found or unauthorized",
    };
  }

  // Rows created before public_id was tracked have no reliable Cloudinary
  // handle — their media can't be identified, so cleanup is skipped and the
  // row is still allowed to be deleted rather than becoming undeletable.
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
    .eq("user_id", user.id); // ownership enforced in the delete query itself

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete slide: ${deleteError.message}`,
    };
  }

  return { status: 200, message: "Slide deleted successfully" };
}
