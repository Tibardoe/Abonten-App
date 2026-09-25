import { logger } from "@abonten/core/logger";
import { userFacingError } from "@abonten/core/userFacingError";
import { destroyAssetIfUnused } from "@abonten/services/media/assetReferences";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth bodies of addPlacePhoto / removePlacePhoto / reorderPlacePhotos,
// lifted so the mobile per-place gallery routes run the same logic. The
// image bytes never pass through here — the caller (browser or device)
// uploads straight to Cloudinary with a short-lived signed folder bound to
// its own user id, and these functions just record / reorder / delete the
// place_photo metadata rows. NOT a "use server" file.

export type PlacePhotoCoreResult = {
  status: 200 | 403 | 404 | 500;
  message: string;
  data?: Database["public"]["Tables"]["place_photo"]["Row"];
};

export async function addPlacePhotoCore(
  supabase: SupabaseClient<Database>,
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
      message: userFacingError("Error adding photo", insertError),
    };
  }

  return { status: 200, message: "Photo added successfully!", data: photo };
}

export async function removePlacePhotoCore(
  supabase: SupabaseClient<Database>,
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

  if (photo.place?.owner_id !== userId) {
    return { status: 403, message: "Not authorized to remove this photo" };
  }

  const { error: deleteError } = await supabase
    .from("place_photo")
    .delete()
    .eq("id", photoId);

  if (deleteError) {
    return {
      status: 500,
      message: userFacingError("Failed to remove photo", deleteError),
    };
  }

  try {
    // Kept when another listing or photo still uses it.
    await destroyAssetIfUnused(photo.public_id, {});
  } catch (cloudError) {
    logger.error("Cloudinary deletion of place photo failed:", cloudError);
    // Not failing the whole removal if Cloudinary cleanup fails.
  }

  return { status: 200, message: "Photo removed successfully!" };
}

// Promote an existing gallery photo to the place's cover
// (place.cover_public_id / cover_version). No Cloudinary destroy — the asset
// stays referenced by its place_photo row. This is the mobile/web "Set as
// cover" action; the only other way to change a cover is updatePlaceCore
// with a freshly uploaded image.
export async function setPlaceCoverFromPhotoCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  placeId: string,
  photoId: string,
): Promise<PlacePhotoCoreResult> {
  const { data: photo, error: fetchError } = await supabase
    .from("place_photo")
    .select("id, public_id, version, place_id, place:place_id(owner_id)")
    .eq("id", photoId)
    .eq("place_id", placeId)
    .maybeSingle();

  if (fetchError || !photo) {
    return { status: 404, message: "Photo not found" };
  }

  if (photo.place?.owner_id !== userId) {
    return { status: 403, message: "Not authorized for this place" };
  }

  const { error: updateError } = await supabase
    .from("place")
    .update({
      cover_public_id: photo.public_id,
      cover_version: photo.version,
    })
    .eq("id", placeId)
    .eq("owner_id", userId);

  if (updateError) {
    return {
      status: 500,
      message: userFacingError("Failed to set cover", updateError),
    };
  }

  return { status: 200, message: "Cover photo updated!" };
}

export async function reorderPlacePhotosCore(
  supabase: SupabaseClient<Database>,
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
