"use server";

import { createClient } from "@/config/supabase/server";
import {
  type UploadSignatureResult,
  buildCloudinaryUploadSignature,
} from "@/utils/cloudinaryUploadSignature";

// Authorizes a direct browser -> Cloudinary upload for a place review's
// photo attachments, mirroring getPlacePhotoUploadSignature.ts. The folder
// is scoped to the user, not to a specific review -- unlike a place's photo
// gallery, the review row this photo will attach to doesn't exist yet at
// upload time (the review is only created once the user submits the whole
// form), so there's nothing else to scope the folder to yet. postPlaceReview.ts
// re-validates this same folder prefix before inserting each
// place_review_photo row, once the review (and therefore its owning
// reviewer_id) actually exists. Shared body:
// src/utils/cloudinaryUploadSignature.ts.
export default async function getPlaceReviewPhotoUploadSignature(): Promise<UploadSignatureResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Sign in to attach photos to a review!" };
  }

  return buildCloudinaryUploadSignature(user.id, "place_review_photo");
}
