"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";

type GetUnreadNotificationCountResult =
  | { status: 401 | 500; message: string }
  | { status: 200; count: number };

/**
 * Count-only query backing the NotificationBell badge — deliberately a
 * separate action from getUserNotifications rather than deriving the count
 * from a fetched page, since the badge needs to stay accurate even while the
 * dropdown itself is closed/unfetched.
 */
export async function getUnreadNotificationCount(): Promise<GetUnreadNotificationCountResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { count, error } = await supabase
    .from("notification")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    logger.error(`Failed fetching unread notification count: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, count: count ?? 0 };
}
