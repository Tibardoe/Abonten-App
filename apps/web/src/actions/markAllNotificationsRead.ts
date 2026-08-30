"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

/**
 * Bulk "Mark all as read" for the NotificationBell panel header. Scoped to
 * the caller's own unread rows only (`user_id` + `read_at IS NULL`), so this
 * can never touch another user's notifications and never re-stamps rows
 * already marked read.
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

  const { error } = await supabase
    .from("notification")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    logger.error(`Failed marking all notifications read: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200 };
}
