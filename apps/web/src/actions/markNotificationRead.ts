"use server";

import { createClient } from "@/config/supabase/server";
import { markNotificationReadFor } from "@abonten/services/notifications/notificationsQuery";

/**
 * Marks one notification read — scoped to the caller's own row via the
 * `.eq("user_id", user.id)` ownership check (matches the convention used
 * throughout src/actions/ for single-row mutations), so a signed-in user can
 * never mark another user's notification read by guessing an id.
 *
 * Shares its query body with the mobile HTTP route via
 * src/utils/notificationsQuery.ts.
 */
export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return markNotificationReadFor(supabase, user.id, notificationId);
}
