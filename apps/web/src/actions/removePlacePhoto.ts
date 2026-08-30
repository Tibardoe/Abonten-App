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

export async function removePlacePhoto(photoId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  // A place_photo row has no owner_id of its own, so ownership is enforced
  // by joining through to the owning place.
  const { data: photo, error: fetchError } = await supabase
    .from("place_photo")
    .select("id, public_id, place:place_id(owner_id)")
    .eq("id", photoId)
    .maybeSingle();

  if (fetchError || !photo) {
    return { status: 404, message: "Photo not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST's embedded-resource shape isn't worth a dedicated type for this one ownership check; no generated Supabase types exist in this repo (see PROJECT.md)
  const typedPhoto = photo as any;

  if (typedPhoto.place?.owner_id !== user.id) {
    return { status: 403, message: "Not authorized to remove this photo" };
  }

  const { error: deleteError } = await supabase
    .from("place_photo")
    .delete()
    .eq("id", photoId);

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to remove photo: ${deleteError.message}`,
    };
  }

  try {
    await cloudinary.uploader.destroy(typedPhoto.public_id);
  } catch (cloudError) {
    logger.error("Cloudinary deletion of place photo failed:", cloudError);
    // Not failing the whole removal if Cloudinary cleanup fails, same as
    // deleteEvent.ts.
  }

  return { status: 200, message: "Photo removed successfully!" };
}
