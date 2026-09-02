"use server";

import { createClient } from "@/config/supabase/server";
import {
  type UploadSignatureResult,
  buildCloudinaryUploadSignature,
} from "@abonten/services/uploads/cloudinaryUploadSignature";

// Authorizes a direct browser -> Cloudinary upload for the place photo
// gallery, without ever exposing CLOUDINARY_API_SECRET to the client.
// Mirrors getHighlightUploadSignature.ts: the folder is bound to the
// caller's own user id and included in the signature, so the browser
// cannot redirect the upload into another user's folder without
// invalidating the signature — this is what a future uploadPlacePhoto
// action should check against (publicId must start with this same folder)
// to enforce ownership on write, same as uploadHighlight.ts does today.
// Shared body: @abonten/services/uploads/cloudinaryUploadSignature.
export default async function getPlacePhotoUploadSignature(): Promise<UploadSignatureResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Sign in to upload place photos!" };
  }

  return buildCloudinaryUploadSignature(user.id, "place_photo");
}
