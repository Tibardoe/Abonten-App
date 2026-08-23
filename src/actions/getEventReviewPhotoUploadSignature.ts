"use server";

import { createClient } from "@/config/supabase/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Event-review counterpart to getPlaceReviewPhotoUploadSignature.ts -- same
// user-scoped-folder reasoning (the event_review row doesn't exist yet at
// upload time). postEventReview.ts re-validates this folder prefix before
// inserting each event_review_photo row.
export default async function getEventReviewPhotoUploadSignature() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Sign in to attach photos to a review!" };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = `event_review_photos/${user.id}`;

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET as string,
  );

  return {
    status: 200,
    data: {
      timestamp,
      signature,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      folder,
    },
  };
}
