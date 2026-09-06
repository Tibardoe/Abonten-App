"use server";

import { createClient } from "@/config/supabase/server";
import { fetchConversationsPage } from "@abonten/services/messaging/conversationsQuery";
import type { ConversationFilter } from "@abonten/types/messagingType";

/**
 * Cursor-paginated inbox list for the signed-in user, newest activity first.
 * Backed by the list_conversations RPC (per-conversation unread computed
 * against the caller's last_read_at). Shares its body with
 * GET /api/mobile/messages.
 */
export async function getConversations(options?: {
  filter?: ConversationFilter;
  cursor?: string | null;
  pageSize?: number;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not logged in",
    };
  }

  return fetchConversationsPage(supabase, user.id, options);
}
