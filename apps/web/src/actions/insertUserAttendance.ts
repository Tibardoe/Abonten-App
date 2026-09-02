"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import { insertUserAttendanceCore } from "@abonten/services/tickets/insertUserAttendance";
import type { AuthOverride } from "@abonten/types/authOverrideType";

/**
 * Thin web wrapper over `insertUserAttendanceCore` — resolves the caller
 * (cookie session, or `authOverride` for the webhook / free-RSVP paths that
 * have no session) and delegates. Server-side only.
 */
export default async function insertUserAttendance(
  eventId: string,
  ticketTypeId: string,
  ticketIds: string[],
  authOverride?: AuthOverride,
) {
  const supabase = authOverride?.supabase ?? (await createClient());

  let userId: string;

  if (authOverride) {
    userId = authOverride.userId;
  } else {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      logger.error(`Failed fetching user: ${userError.message}`);
      return { status: 500, message: "Something went wrong!" };
    }

    if (!user) {
      return { status: 401, message: "User not logged in" };
    }

    userId = user.id;
  }

  return insertUserAttendanceCore(
    supabase,
    userId,
    eventId,
    ticketTypeId,
    ticketIds,
  );
}
