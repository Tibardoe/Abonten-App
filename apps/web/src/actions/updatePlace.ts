"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import { validateLocationInput } from "@abonten/core/validateLocationInput";
import { v2 as cloudinary } from "cloudinary";
import { savePlacePhotoToCloudinary } from "./savePlacePhotoToCloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export type UpdatePlaceInput = {
  placeId: string;
  name: string;
  description: string;
  categoryId: number;
  websiteUrl?: string;
  phone?: string;
  whatsapp?: string;
  socialLinks?: Record<string, string>;
  address: string;
  latitude: number;
  longitude: number;
  // Places Milestone 6 management page: optional cover photo replacement.
  // A place always requires exactly one cover photo (place.cover_public_id
  // is NOT NULL), so this deliberately mirrors updateEvent.ts's
  // `selectedFile` — the one required-image field this action DOES touch,
  // unlike the multi-photo gallery below which keeps its own dedicated
  // actions (addPlacePhoto.ts/removePlacePhoto.ts/reorderPlacePhotos.ts).
  selectedFile?: File | null;
};

/**
 * Edits a place's core, non-structural fields (name/description/category/
 * contact info/location/cover photo). Deliberately doesn't touch opening
 * hours, services, or the photo gallery — those each have their own
 * dedicated actions (updatePlaceOpeningHours.ts, addPlaceService.ts/
 * updatePlaceService.ts, addPlacePhoto.ts/reorderPlacePhotos.ts) since
 * they're separate tables with their own replace/reorder semantics, same
 * reasoning as updateEvent.ts deliberately not touching ticket_type/
 * promo_code.
 */
export async function updatePlace(formData: UpdatePlaceInput) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const {
    placeId,
    name,
    description,
    categoryId,
    websiteUrl,
    phone,
    whatsapp,
    socialLinks,
    address,
    latitude,
    longitude,
    selectedFile,
  } = formData;

  const locationCheck = validateLocationInput({ address, latitude, longitude });
  if (!locationCheck.valid) {
    return { status: 400, message: locationCheck.message };
  }

  const { data: existingPlace, error: fetchError } = await supabase
    .from("place")
    .select("id, owner_id, cover_public_id")
    .eq("id", placeId)
    .maybeSingle();

  if (fetchError || !existingPlace) {
    return { status: 404, message: "Place not found" };
  }

  if (existingPlace.owner_id !== user.id) {
    return { status: 403, message: "Not authorized to edit this place" };
  }

  let coverPublicId = existingPlace.cover_public_id;
  let coverVersion: string | number | undefined;
  let previousCoverPublicId: string | null = null;

  if (selectedFile) {
    const coverUpload = await savePlacePhotoToCloudinary(selectedFile);

    if (!coverUpload?.public_id || !coverUpload?.version) {
      return {
        status: 500,
        message:
          (coverUpload as { error?: string })?.error ??
          "Cover photo upload to Cloudinary failed.",
      };
    }

    previousCoverPublicId = coverPublicId;
    coverPublicId = coverUpload.public_id;
    coverVersion = String(coverUpload.version);
  }

  const { error: updateError } = await supabase
    .from("place")
    .update({
      name,
      description,
      category_id: categoryId,
      website_url: websiteUrl ?? null,
      phone: phone ?? null,
      whatsapp: whatsapp ?? null,
      social_links: socialLinks ?? null,
      address: { full_address: address },
      location: `POINT(${longitude} ${latitude})`,
      cover_public_id: coverPublicId,
      ...(coverVersion !== undefined && { cover_version: coverVersion }),
      updated_at: new Date(),
    })
    .eq("id", placeId)
    .eq("owner_id", user.id);

  if (updateError) {
    return {
      status: 500,
      message: `Error updating place: ${updateError.message}`,
    };
  }

  if (previousCoverPublicId) {
    try {
      await cloudinary.uploader.destroy(previousCoverPublicId);
    } catch (cloudError) {
      logger.error(
        "Cloudinary deletion of old cover photo failed:",
        cloudError,
      );
      // Not failing the whole update if cleanup of the old cover fails.
    }
  }

  return { status: 200, message: "Place updated successfully!" };
}
