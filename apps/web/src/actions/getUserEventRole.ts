"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { userEventRoleQuery } from "@abonten/services/profile/userRolesQuery";

export const getUserEventRole = withActionLocale(
  async function getUserEventRole(userId: string) {
    const supabase = await createClient();

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user || userError || user.id !== userId) {
        return { status: 401, role: "none" };
      }

      return await userEventRoleQuery(supabase, userId);
    } catch (error) {
      logger.error("Error checking user event role:", error);
      return { role: "none" };
    }
  },
);
