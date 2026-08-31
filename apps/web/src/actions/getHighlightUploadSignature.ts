"use server";

import { createClient } from "@/config/supabase/server";
import {
  type UploadSignatureResult,
  buildCloudinaryUploadSignature,
} from "@/utils/cloudinaryUploadSignature";

// Authorizes a direct browser -> Cloudinary upload without ever exposing
// CLOUDINARY_API_SECRET to the client. The folder is bound to the caller's
// own user id and included in the signature, so the browser cannot redirect
// the upload into another user's folder without invalidating the signature
// -- this is what uploadHighlight.ts later checks against (publicId must
// start with this same folder) to enforce ownership on write. Shared body:
// src/utils/cloudinaryUploadSignature.ts.
export default async function getHighlightUploadSignature(): Promise<UploadSignatureResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Sign in to upload highlight!" };
  }

  return buildCloudinaryUploadSignature(user.id, "highlight");
}
