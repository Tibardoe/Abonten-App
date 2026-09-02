"use server";

import { createClient } from "@/config/supabase/server";
import { markAllNotificationsReadFor } from "@abonten/services/notifications/notificationsQuery";

/**
 * Bulk "Mark all as read" for the NotificationBell panel header. Scoped to
 * the caller's own unread rows only (`user_id` + `read_at IS NULL`), so this
 * can never touch another user's notifications and never re-stamps rows
 * already marked read.
 *
 * Shares its query body with the mobile HTTP route via
 * src/utils/notificationsQuery.ts.
 */
export async function markAllNotificationsRead() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return markAllNotificationsReadFor(supabase, user.id);
}
