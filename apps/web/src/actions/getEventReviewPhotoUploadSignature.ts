"use server";

import { createClient } from "@/config/supabase/server";
import {
  type UploadSignatureResult,
  buildCloudinaryUploadSignature,
} from "@abonten/services/uploads/cloudinaryUploadSignature";

// Event-review counterpart to getPlaceReviewPhotoUploadSignature.ts -- same
// user-scoped-folder reasoning (the event_review row doesn't exist yet at
// upload time). postEventReview.ts re-validates this folder prefix before
// inserting each event_review_photo row. Shared body:
// @abonten/services/uploads/cloudinaryUploadSignature.
export default async function getEventReviewPhotoUploadSignature(): Promise<UploadSignatureResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Sign in to attach photos to a review!" };
  }

  return buildCloudinaryUploadSignature(user.id, "event_review_photo");
}
