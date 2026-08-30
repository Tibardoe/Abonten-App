"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";

/**
 * Marks one notification read — scoped to the caller's own row via the
 * `.eq("user_id", user.id)` ownership check (matches the convention used
 * throughout src/actions/ for single-row mutations), so a signed-in user can
 * never mark another user's notification read by guessing an id.
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

  const { error } = await supabase
    .from("notification")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  if (error) {
    logger.error(`Failed marking notification read: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200 };
}
