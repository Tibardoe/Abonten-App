"use server";

import { createClient } from "@/config/supabase/server";
import {
  type PostPlaceCoreResult,
  postPlaceCore,
} from "@abonten/services/places/postPlaceCore";
import type { PlaceFormType } from "@abonten/types/placeType";
import { savePlacePhotoToCloudinary } from "./savePlacePhotoToCloudinary";

export async function postPlace(
  formData: PlaceFormType,
): Promise<PostPlaceCoreResult | { status: 400 | 401 | 500; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { selectedFile, existingCoverPhoto } = formData;

  if (!selectedFile && !existingCoverPhoto) {
    return { status: 400, message: "A cover photo is required." };
  }

  let coverPublicId: string;
  let coverVersion: string | number;

  if (existingCoverPhoto) {
    coverPublicId = existingCoverPhoto.public_id;
    coverVersion = existingCoverPhoto.version;
  } else if (selectedFile) {
    const coverUpload = await savePlacePhotoToCloudinary(selectedFile);

    if (!coverUpload?.public_id || !coverUpload?.version) {
      return {
        status: 500,
        message:
          (coverUpload as { error?: string })?.error ??
          "Cover photo upload to Cloudinary failed.",
      };
    }

    coverPublicId = coverUpload.public_id;
    coverVersion = coverUpload.version;
  } else {
    // Unreachable given the guard above, but keeps the cover vars
    // definitely-assigned for TypeScript.
    return { status: 400, message: "A cover photo is required." };
  }

  return postPlaceCore(supabase, user.id, {
    name: formData.name,
    categoryId: formData.categoryId,
    description: formData.description,
    address: formData.address,
    latitude: formData.latitude,
    longitude: formData.longitude,
    websiteUrl: formData.websiteUrl,
    phone: formData.phone,
    whatsapp: formData.whatsapp,
    socialLinks: formData.socialLinks,
    coverPublicId,
    coverVersion: String(coverVersion),
    openingHours: formData.openingHours,
    services: formData.services,
    clientRequestId: formData.clientRequestId,
    draftId: formData.draftId,
  });
}
