"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { markConversationUnreadCore } from "@abonten/services/messaging/conversationStateCore";
import { z } from "zod";

const schema = z.object({
  conversationId: z.string().uuid(),
});

/**
 * Rewind the caller's read cursor so a conversation reads as unread again
 * (inbox row menu / swipe action). Only ever touches the caller's own
 * participant row. Shares its body with POST /api/mobile/messages/unread.
 */
export const markConversationUnread = withActionLocale(
  async function markConversationUnread(input: {
    conversationId: string;
  }) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { status: 401, message: tr("userNotLoggedIn") };
    }

    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { status: 400, message: tr("invalidRequest") };
    }

    return markConversationUnreadCore(supabase, user.id, {
      conversationId: parsed.data.conversationId,
    });
  },
);
