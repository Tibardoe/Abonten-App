"use server";

import { createClient } from "@/config/supabase/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Authorizes a direct browser -> Cloudinary avatar upload, replacing the old
// saveAvatarToCloudinary.ts server-proxied upload (temp file write + SDK
// upload) with the same direct-upload pattern already used for review
// photos/highlights/event flyers (see uploadToCloudinary.ts) -- this is what
// makes real upload-progress feedback possible, which a Server Action can't
// report. Scoped to the user's own folder, mirroring
// getEventReviewPhotoUploadSignature.ts/getPlaceReviewPhotoUploadSignature.ts.
export default async function getAvatarUploadSignature() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Sign in to update your profile photo!" };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = `user_profiles/${user.id}`;

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
