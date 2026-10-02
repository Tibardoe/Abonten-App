"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type UploadSignatureResult,
  buildCloudinaryUploadSignature,
} from "@abonten/services/uploads/cloudinaryUploadSignature";

// Authorizes a direct browser -> Cloudinary avatar upload, replacing the old
// saveAvatarToCloudinary.ts server-proxied upload (temp file write + SDK
// upload) with the same direct-upload pattern already used for review
// photos/highlights/event flyers (see uploadToCloudinary.ts) -- this is what
// makes real upload-progress feedback possible, which a Server Action can't
// report. Scoped to the user's own folder, mirroring
// getEventReviewPhotoUploadSignature.ts/getPlaceReviewPhotoUploadSignature.ts.
// Shared body lives in @abonten/services/uploads/cloudinaryUploadSignature so the mobile
// /api/mobile/uploads/signature route produces an identical signature.
export default withActionLocale(
  async function getAvatarUploadSignature(): Promise<UploadSignatureResult> {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return {
        status: 401,
        message: tr("signInToUpdateYourProfile"),
      };
    }

    return buildCloudinaryUploadSignature(user.id, "avatar");
  },
);
