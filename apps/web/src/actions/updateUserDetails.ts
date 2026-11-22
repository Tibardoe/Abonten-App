"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import {
  type ProfileUpdateResult,
  updateProfileCore,
} from "@abonten/services/profile/updateProfileCore";
import type { UserDetailsFormType } from "@abonten/types/userProfileType";
import { getTranslations } from "next-intl/server";

// Edit profile on the website. The same service as the app's
// PATCH /api/mobile/profile (@abonten/services/profile/updateProfileCore):
// only the profile's own fields are written, with this person's session,
// and social accounts are checked and stored in their canonical form.
export const updateUserDetails = withActionLocale(
  async function updateUserDetails(formData: UserDetailsFormType): Promise<{
    status: number;
    message?: string;
    data?: ProfileUpdateResult["data"];
  }> {
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
    const result = await updateProfileCore(supabase, user.user.id, formData);
    if (result.status !== 200) return result;

    return { ...result, message: t("updateSuccess") };
  },
);
