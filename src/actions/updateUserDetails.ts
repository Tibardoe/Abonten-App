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

  const { error } = await supabase
    .from("user_info")
    .update(formData)
    .eq("id", user.user.id);

  if (error) {
    return {
      status: 500,
      message: `${t("errors.updateFailed")}: ${error.message}`,
    };
  }

  return { status: 200, message: t("updateSuccess") };
}
