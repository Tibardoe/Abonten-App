"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import type { UserDetailsFormType } from "@abonten/types/userProfileType";
import { getTranslations } from "next-intl/server";

export async function updateUserDetails(formData: UserDetailsFormType) {
  const supabase = await createClient();
  const t = await getTranslations("settings");

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    logger.error("updateUserDetails: failed to fetch user", userError);
    return {
      status: 500,
      message: t("errors.fetchUserFailed"),
    };
  }

  if (!user) {
    return { status: 401, message: t("errors.notAuthenticated") };
  }

  // Changing the username marks it as chosen (no longer the sign-up
  // placeholder) for account setup — the database does that itself
  // (user_info_username_chosen trigger), the same for web and mobile.
  const { error } = await supabase
    .from("user_info")
    .update(formData)
    .eq("id", user.user.id);

  if (error) {
    logger.error("updateUserDetails: failed to update user_info", error);
    return {
      status: 500,
      message: t("errors.updateFailed"),
    };
  }

  return { status: 200, message: t("updateSuccess") };
}
