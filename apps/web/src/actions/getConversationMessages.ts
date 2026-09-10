"use server";

import { createClient } from "@/config/supabase/server";
import { fetchMessagesPage } from "@abonten/services/messaging/messagesQuery";

/**
 * Newest-first, keyset-paginated page of one conversation's messages (scroll
 * up to load older). RLS restricts this to conversations the caller belongs
 * to; a non-participant gets a 404 envelope, matching the detail read
 * (fetchMessagesPage checks membership when a first page comes back empty).
 * Soft-deleted messages come
 * back with content/attachments stripped. Shares its body with
 * GET /api/mobile/messages/:id/messages.
 */
export async function getConversationMessages(
  conversationId: string,
  options?: { cursor?: string | null; pageSize?: number },
) {
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

  return fetchMessagesPage(supabase, conversationId, {
    ...options,
    callerId: user.id,
  });
}
