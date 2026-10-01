"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { getEventForEditCore } from "@abonten/services/events/getEventForEditCore";
import { tr } from "@abonten/services/i18n/requestLocale";

/**
 * Fetches a single event scoped to the current user, for prefilling the
 * edit form. Owner-scoped on the query itself (`.eq("organizer_id",
 * user.id)`), the same pattern used by deleteEvent.ts/cancelEvent.ts. Query
 * body shared with the mobile edit route via @/utils/getEventForEditCore.
 */
export const getEventForEdit = withActionLocale(async function getEventForEdit(
  eventId: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      status: 401 as const,
      message: tr("userNotAuthenticated"),
    };
  }

  return getEventForEditCore(supabase, user.id, eventId);
});
