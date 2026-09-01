"use server";

import { createClient } from "@/config/supabase/server";
import { getEventForEditCore } from "@/utils/getEventForEditCore";

/**
 * Fetches a single event scoped to the current user, for prefilling the
 * edit form. Owner-scoped on the query itself (`.eq("organizer_id",
 * user.id)`), the same pattern used by deleteEvent.ts/cancelEvent.ts. Query
 * body shared with the mobile edit route via @/utils/getEventForEditCore.
 */
export async function getEventForEdit(eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  return getEventForEditCore(supabase, user.id, eventId);
}
