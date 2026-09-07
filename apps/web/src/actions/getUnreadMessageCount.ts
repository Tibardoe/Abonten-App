"use server";

import { createClient } from "@/config/supabase/server";
import { getUnreadMessageCount as getUnreadMessageCountQuery } from "@abonten/services/messaging/conversationsQuery";

/**
 * Global unread-conversation count for the Messages nav badge. Non-archived
 * conversations with at least one unread message (muted still counts).
 * Shares its body with GET /api/mobile/messages/unread-count.
 */
export async function getUnreadMessageCount() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: 401 as const, count: 0, message: "User not logged in" };
  }

  return getUnreadMessageCountQuery(supabase, user.id);
}
