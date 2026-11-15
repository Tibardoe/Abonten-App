"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { teamInboxAccount } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchConversationsPage } from "@abonten/services/messaging/conversationsQuery";
import type {
  ConversationFilter,
  ConversationRoleScope,
  ConversationType,
} from "@abonten/types/messagingType";

/**
 * Cursor-paginated inbox list for the signed-in user, newest activity first.
 * Backed by the list_conversations RPC (per-conversation unread computed
 * against the caller's last_read_at). Shares its body with
 * GET /api/mobile/messages.
 */
export const getConversations = withActionLocale(
  async function getConversations(options?: {
    filter?: ConversationFilter;
    roleScope?: ConversationRoleScope;
    cursor?: string | null;
    pageSize?: number;
    search?: string | null;
    type?: ConversationType | null;
    muted?: boolean | null;
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
        message: tr("userNotLoggedIn"),
      };
    }

    // Managing as a team that the person answers messages for: its inbox.
    return fetchConversationsPage(supabase, user.id, {
      ...options,
      accountId: await teamInboxAccount(user.id),
    });
  },
);
