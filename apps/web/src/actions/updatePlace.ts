"use server";

import { createClient } from "@/config/supabase/server";
import {
  type UpdatePlaceCoreResult,
  updatePlaceCore,
} from "@abonten/services/places/updatePlaceCore";
import { savePlacePhotoToCloudinary } from "./savePlacePhotoToCloudinary";

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
  // `selectedFile`.
  selectedFile?: File | null;
};

/**
 * Edits a place's core, non-structural fields (name/description/category/
 * contact info/location/cover photo). Thin wrapper: auth, upload a
 * replacement cover here if one was picked, then delegate to
 * updatePlaceCore — the body shared with the mobile
 * PATCH /api/mobile/organizer/places/:id route. Deliberately doesn't touch
 * opening hours, services, or the photo gallery — those each have their
 * own dedicated actions.
 */
export async function updatePlace(
  formData: UpdatePlaceInput,
): Promise<UpdatePlaceCoreResult | { status: 401 | 500; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  let coverPublicId: string | null | undefined;
  let coverVersion: string | null | undefined;

  if (formData.selectedFile) {
    const coverUpload = await savePlacePhotoToCloudinary(formData.selectedFile);

    if (!coverUpload?.public_id || !coverUpload?.version) {
      return {
        status: 500 as const,
        message:
          (coverUpload as { error?: string })?.error ??
          "Cover photo upload to Cloudinary failed.",
      };
    }

    coverPublicId = coverUpload.public_id;
    coverVersion = String(coverUpload.version);
  }

  return updatePlaceCore(supabase, user.id, {
    placeId: formData.placeId,
    name: formData.name,
    description: formData.description,
    categoryId: formData.categoryId,
    websiteUrl: formData.websiteUrl,
    phone: formData.phone,
    whatsapp: formData.whatsapp,
    socialLinks: formData.socialLinks,
    address: formData.address,
    latitude: formData.latitude,
    longitude: formData.longitude,
    coverPublicId,
    coverVersion,
  });
}
