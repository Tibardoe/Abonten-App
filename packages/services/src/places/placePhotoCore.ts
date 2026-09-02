import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Post-auth bodies of addPlacePhoto / removePlacePhoto / reorderPlacePhotos,
// lifted so the mobile per-place gallery routes run the same logic. The
// image bytes never pass through here — the caller (browser or device)
// uploads straight to Cloudinary with a short-lived signed folder bound to
// its own user id, and these functions just record / reorder / delete the
// place_photo metadata rows. NOT a "use server" file.

export type PlacePhotoCoreResult = {
  status: 200 | 403 | 404 | 500;
  message: string;
  // biome-ignore lint/suspicious/noExplicitAny: raw inserted row, no generated Supabase types (see PROJECT.md)
  data?: any;
};

export async function addPlacePhotoCore(
  supabase: SupabaseClient,
  userId: string,
  placeId: string,
  publicId: string,
  version: string,
): Promise<PlacePhotoCoreResult> {
  const { data: place, error: fetchError } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (fetchError || !place) {
    return { status: 404, message: "Place not found or unauthorized" };
  }

  // The public_id's folder was bound to this user's id when the signature
  // was issued — a publicId outside that folder means tampered metadata.
  if (!publicId.startsWith(`place_photos/${userId}/`)) {
    return { status: 403, message: "Not authorized for this photo" };
  }

  const { count } = await supabase
    .from("place_photo")
    .select("id", { count: "exact", head: true })
    .eq("place_id", placeId);

  const { data: photo, error: insertError } = await supabase
    .from("place_photo")
    .insert({
      place_id: placeId,
      public_id: publicId,
      version,
      position: count ?? 0,
    })
    .select()
    .single();

  if (insertError) {
    return {
      status: 500,
      message: `Error adding photo: ${insertError.message}`,
    };
  }

  return { status: 200, message: "Photo added successfully!", data: photo };
}

export async function removePlacePhotoCore(
  supabase: SupabaseClient,
  userId: string,
  photoId: string,
): Promise<PlacePhotoCoreResult> {
  // A place_photo row has no owner_id — ownership is via the owning place.
  const { data: photo, error: fetchError } = await supabase
    .from("place_photo")
    .select("id, public_id, place:place_id(owner_id)")
    .eq("id", photoId)
    .maybeSingle();

  if (fetchError || !photo) {
    return { status: 404, message: "Photo not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: embedded-resource shape, no generated Supabase types (see PROJECT.md)
  const typedPhoto = photo as any;

  if (typedPhoto.place?.owner_id !== userId) {
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
    // Not failing the whole removal if Cloudinary cleanup fails.
  }

  return { status: 200, message: "Photo removed successfully!" };
}

export async function reorderPlacePhotosCore(
  supabase: SupabaseClient,
  userId: string,
  placeId: string,
  photoIds: string[],
): Promise<PlacePhotoCoreResult> {
  const { data: place, error: fetchError } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (fetchError || !place) {
    return { status: 404, message: "Place not found or unauthorized" };
  }

  const results = await Promise.all(
    photoIds.map((photoId, index) =>
      supabase
        .from("place_photo")
        .update({ position: index })
        .eq("id", photoId)
        .eq("place_id", placeId),
    ),
  );

  const failed = results.find((result) => result.error);

  if (failed?.error) {
    return {
      status: 500,
      message: `Error reordering photos: ${failed.error.message}`,
    };
  }

  return { status: 200, message: "Photos reordered successfully!" };
}
