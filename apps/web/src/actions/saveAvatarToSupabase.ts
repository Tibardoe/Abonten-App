"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";

export async function saveToSupabase(
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
      message: "We couldn't load your account. Please try again.",
    };
  }

  if (!user) {
    return { status: 401, message: "You need to be signed in to do that." };
  }

  const { error: updateError } = await supabase
    .from("user_info")
    .update({ avatar_public_id: publicId, avatar_version: version })
    .eq("id", user.user.id);

  if (updateError) {
    logger.error(
      "saveAvatarToSupabase: failed to update user_info",
      updateError,
    );
    return {
      status: 500,
      message: "We couldn't update your profile photo. Please try again.",
    };
  }

  const { error: insertEror } = await supabase
    .from("user_image_history")
    .insert({
      user_id: user.user.id,
      public_id: publicId,
      version: version,
      transformation: transformation,
    })
    .eq("user_id", user.user.id);

  if (insertEror) {
    logger.error(
      "saveAvatarToSupabase: failed to record image history",
      insertEror,
    );
    return {
      status: 500,
      message: "We couldn't update your profile photo. Please try again.",
    };
  }

  return { status: 200, message: "Profile updated successfully." };
}
