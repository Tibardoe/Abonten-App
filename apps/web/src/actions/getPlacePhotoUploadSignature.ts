"use server";

import { createClient } from "@/config/supabase/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Authorizes a direct browser -> Cloudinary upload for the place photo
// gallery, without ever exposing CLOUDINARY_API_SECRET to the client.
// Mirrors getHighlightUploadSignature.ts: the folder is bound to the
// caller's own user id and included in the signature, so the browser
// cannot redirect the upload into another user's folder without
// invalidating the signature — this is what a future uploadPlacePhoto
// action should check against (publicId must start with this same folder)
// to enforce ownership on write, same as uploadHighlight.ts does today.
export default async function getPlacePhotoUploadSignature() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Sign in to upload place photos!" };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = `place_photos/${user.id}`;

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
