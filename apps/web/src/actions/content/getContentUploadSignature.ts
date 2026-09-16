"use server";

import { createClient } from "@/config/supabase/server";
import { canUploadContentMedia } from "@abonten/services/content/contentMediaCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import {
  type UploadSignatureResult,
  buildCloudinaryUploadSignature,
} from "@abonten/services/uploads/cloudinaryUploadSignature";

// Signs a direct browser -> Cloudinary upload for Spotlight and Story media,
// scoped to content_media/<user id>. registerContentMedia later re-reads the
// asset from Cloudinary and refuses anything outside that folder. Mobile uses
// POST /api/mobile/uploads/signature with kind "content".
export default async function getContentUploadSignature(): Promise<UploadSignatureResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user || error) {
    return { status: 401, message: "Sign in to upload." };
  }
  if (!(await canUploadContentMedia(getSupabaseServiceClient(), user.id))) {
    return {
      status: 401,
      message: "Posting isn't available for your account.",
    };
  }
  return buildCloudinaryUploadSignature(user.id, "content");
}
