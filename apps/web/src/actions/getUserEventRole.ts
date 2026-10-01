"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";

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

      const roles: ("organizer" | "attendee")[] = [];
      // Check if user is an organizer
      const { data: organizerEvent, error: organizerEventError } =
        await supabase
          .from("event")
          .select("organizer_id")
          .eq("organizer_id", userId);

      if (organizerEventError) {
        logger.error(
          `Error fetching organizer events: ${organizerEventError.message}`,
        );

        return { status: 500, message: tr("somethingWentWrong") };
      }

      if (organizerEvent && organizerEvent.length > 0) {
        roles.push("organizer");
      }

      // Check if user is an attendee
      const { data: attendeeEntry, error: attendeeEntryError } = await supabase
        .from("ticket")
        .select("user_id")
        .eq("user_id", userId);

      if (attendeeEntryError) {
        logger.error(
          `Error fetching organizer events: ${attendeeEntryError.message}`,
        );

        return { status: 500, message: tr("somethingWentWrong") };
      }

      if (attendeeEntry && attendeeEntry.length > 0) {
        roles.push("attendee");
      }

      if (roles.length === 0) {
        return { role: "none" };
      }

      return { role: roles };
    } catch (error) {
      logger.error("Error checking user event role:", error);
      return { role: "none" };
    }
  },
);
