"use server";

import { createClient } from "@/config/supabase/server";
import type { UserDetailsFormType } from "@/types/userProfileType";
import { getTranslations } from "next-intl/server";

export async function updateUserDetails(formData: UserDetailsFormType) {
  const supabase = await createClient();
  const t = await getTranslations("settings");

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `${t("errors.fetchUserFailed")}: ${userError.message} `,
    };
  }

  if (!user) {
    return { status: 401, message: t("errors.notAuthenticated") };
  }

  // Saving the Edit Profile form is the only place a username change
  // happens, so submitting it counts as the user having customized their
  // username -- it stops counting as the system-assigned default for
  // profile-completion purposes (see src/utils/profileCompletion.ts).
  const { error } = await supabase
    .from("user_info")
    .update({ ...formData, username_is_generated: false })
    .eq("id", user.user.id);

  if (error) {
    return {
      status: 500,
      message: `${t("errors.updateFailed")}: ${error.message}`,
    };
  }

  return { status: 200, message: t("updateSuccess") };
}
