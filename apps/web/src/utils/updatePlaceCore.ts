import { logger } from "@abonten/core/logger";
import { validateLocationInput } from "@abonten/core/validateLocationInput";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Post-auth body of updatePlace, lifted so the mobile
// PATCH /api/mobile/organizer/places/:id route runs the exact same edit.
// Like updateEventCore, the platform difference (server File upload vs
// device signed upload) is resolved by the caller passing an already-
// uploaded coverPublicId/coverVersion; omit both to keep the current
// cover. Deliberately doesn't touch opening hours / services / the photo
// gallery — those have their own endpoints. NOT a "use server" file.

export type UpdatePlaceCoreInput = {
  placeId: string;
  name: string;
  description: string;
  categoryId: number;
  websiteUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  socialLinks?: Record<string, string> | null;
  address: string;
  latitude: number;
  longitude: number;
  // Both omitted (undefined) = keep the current cover photo.
  coverPublicId?: string | null;
  coverVersion?: string | null;
};

export type UpdatePlaceCoreResult = {
  status: 200 | 400 | 403 | 404 | 500;
  message: string;
};

export async function updatePlaceCore(
  supabase: SupabaseClient,
  userId: string,
  input: UpdatePlaceCoreInput,
): Promise<UpdatePlaceCoreResult> {
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
    coverPublicId,
    coverVersion,
  } = input;

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

  if (existingPlace.owner_id !== userId) {
    return { status: 403, message: "Not authorized to edit this place" };
  }

  const replacingCover = !!coverPublicId && !!coverVersion;
  const previousCoverPublicId = replacingCover
    ? (existingPlace.cover_public_id as string | null)
    : null;

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
      ...(replacingCover && {
        cover_public_id: coverPublicId,
        cover_version: coverVersion,
      }),
      updated_at: new Date(),
    })
    .eq("id", placeId)
    .eq("owner_id", userId);

  if (updateError) {
    return {
      status: 500,
      message: `Error updating place: ${updateError.message}`,
    };
  }

  if (previousCoverPublicId && previousCoverPublicId !== coverPublicId) {
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
