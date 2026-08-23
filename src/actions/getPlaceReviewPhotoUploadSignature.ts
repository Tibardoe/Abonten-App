"use server";

import { createClient } from "@/config/supabase/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Authorizes a direct browser -> Cloudinary upload for a place review's
// photo attachments, mirroring getPlacePhotoUploadSignature.ts. The folder
// is scoped to the user, not to a specific review -- unlike a place's photo
// gallery, the review row this photo will attach to doesn't exist yet at
// upload time (the review is only created once the user submits the whole
// form), so there's nothing else to scope the folder to yet. postPlaceReview.ts
// re-validates this same folder prefix before inserting each
// place_review_photo row, once the review (and therefore its owning
// reviewer_id) actually exists.
export default async function getPlaceReviewPhotoUploadSignature() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Sign in to attach photos to a review!" };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = `place_review_photos/${user.id}`;

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
