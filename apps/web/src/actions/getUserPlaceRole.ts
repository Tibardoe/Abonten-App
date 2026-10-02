"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { userPlaceRoleQuery } from "@abonten/services/profile/userRolesQuery";

export const getUserPlaceRole = withActionLocale(
  async function getUserPlaceRole(userId: string) {
    const supabase = await createClient();

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user || userError || user.id !== userId) {
        return { status: 401, role: "none" };
      }

      return await userPlaceRoleQuery(supabase, userId);
    } catch (error) {
      logger.error("Error checking user place role:", error);
      return { role: "none" };
    }
  },
);
