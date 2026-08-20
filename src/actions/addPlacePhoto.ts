"use server";

import { createClient } from "@/config/supabase/server";

// Records one place_photo row after a gallery photo finished uploading
// directly from the browser to Cloudinary (see getPlacePhotoUploadSignature.ts
// + uploadToCloudinary.ts) -- mirrors uploadHighlight.ts's "metadata only,
// after the fact" shape, so the image bytes themselves never pass through a
// Server Action body. Milestone 2 built the signed-upload half
// (getPlacePhotoUploadSignature.ts) and the remove/reorder halves
// (removePlacePhoto.ts/reorderPlacePhotos.ts) but not this "insert after
// upload" half, since it wasn't needed until the management page's gallery
// (this milestone) actually drives uploads.
export async function addPlacePhoto(
  placeId: string,
  publicId: string,
  version: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: place, error: fetchError } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (fetchError || !place) {
    return { status: 404, message: "Place not found or unauthorized" };
  }

  // The public_id's folder was bound to this user's id when the signature
  // was issued (see getPlacePhotoUploadSignature.ts) -- a publicId outside
  // that folder means the metadata was tampered with client-side, since a
  // legitimate upload could never have landed anywhere else. Same check as
  // uploadHighlight.ts.
  const expectedFolderPrefix = `place_photos/${user.id}/`;

  if (!publicId.startsWith(expectedFolderPrefix)) {
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
