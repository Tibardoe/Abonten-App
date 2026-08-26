"use server";

import { createClient } from "@/config/supabase/server";
import type { UserDetailsFormType } from "@/types/userProfileType";
import { getTranslations } from "next-intl/server";

export async function updateUserDetails(formData: UserDetailsFormType) {
  const supabase = await createClient();
  const t = await getTranslations("settings");

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error("updateUserDetails: failed to fetch user", userError);
    return {
      status: 500,
      message: t("errors.fetchUserFailed"),
    };
  }

  if (!user) {
    return { status: 401, message: t("errors.notAuthenticated") };
  }

  // Saving the Edit Profile form is the only place a username change
  // happens, so changing it counts as the user having customized their
  // username -- it stops counting as the system-assigned default for
  // profile-completion purposes (see src/utils/profileCompletion.ts).
  // Only flip that flag when the username actually changed, so re-saving
  // e.g. just the bio doesn't wrongly mark an untouched auto-generated
  // username as customized.
  const { data: currentInfo } = await supabase
    .from("user_info")
    .select("username")
    .eq("id", user.user.id)
    .single();

  const usernameChanged = currentInfo?.username !== formData.username;

  const { error } = await supabase
    .from("user_info")
    .update(
      usernameChanged
        ? { ...formData, username_is_generated: false }
        : formData,
    )
    .eq("id", user.user.id);

  if (error) {
    console.error("updateUserDetails: failed to update user_info", error);
    return {
      status: 500,
      message: t("errors.updateFailed"),
    };
  }

  return { status: 200, message: t("updateSuccess") };
}
