"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getConversationContext } from "@abonten/services/messaging/conversationsQuery";

/**
 * Header/context payload for one open conversation — subject (event/place),
 * participants + profiles, my participant row, and who I've blocked. Returns
 * 404 (not 403) when the caller isn't a participant, since RLS hides the
 * row entirely. Shares its body with GET /api/mobile/messages/:id.
 */
export const getConversationDetail = withActionLocale(
  async function getConversationDetail(conversationId: string) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { status: 401, message: tr("userNotLoggedIn") };
    }

    return getConversationContext(supabase, user.id, conversationId);
  },
);
