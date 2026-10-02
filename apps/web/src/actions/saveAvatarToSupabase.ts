"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";

export const saveToSupabase = withActionLocale(async function saveToSupabase(
  publicId: string,
  version: number,
  transformation: string,
) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    logger.error("saveAvatarToSupabase: failed to fetch user", userError);
    return {
      status: 500,
      message: tr("weCouldnTLoadYourAccount"),
    };
  }

  if (!user) {
    return { status: 401, message: tr("youNeedToBeSignedIn") };
  }

  // The public_id's folder was bound to this user's id when the upload
  // signature was issued (getAvatarUploadSignature.ts -> "user_profiles/<id>").
  // A public_id outside that folder means the client-supplied metadata was
  // tampered with — a real upload could never have landed elsewhere. Same
  // guard uploadHighlight.ts / addPlacePhotoCore / insertReviewPhotos apply.
  if (!publicId.startsWith(`user_profiles/${user.user.id}/`)) {
    return { status: 403, message: tr("notAuthorizedForThisImage") };
  }

  const { error: updateError } = await supabase
    .from("user_info")
    .update({ avatar_public_id: publicId, avatar_version: String(version) })
    .eq("id", user.user.id);

  if (updateError) {
    logger.error(
      "saveAvatarToSupabase: failed to update user_info",
      updateError,
    );
    return {
      status: 500,
      message: tr("weCouldnTUpdateYourProfile"),
    };
  }

  const { error: insertEror } = await supabase
    .from("user_image_history")
    .insert({
      user_id: user.user.id,
      public_id: publicId,
      version: String(version),
      transformation: transformation,
    });

  if (insertEror) {
    // The avatar itself is already saved above. user_image_history is a
    // bookkeeping trail, so failing the whole action here told the user their
    // photo change had failed when it had actually worked — and a retry just
    // uploaded another Cloudinary asset. That is exactly what happened between
    // 2026-08-25 (RLS enabled on this table with only a SELECT policy) and the
    // 20260909115349 migration that added the missing owner INSERT policy.
    // Log it and report the success the user can actually see.
    logger.error(
      "saveAvatarToSupabase: failed to record image history",
      insertEror,
    );
  }

  return { status: 200, message: tr("profileUpdatedSuccessfully") };
});
