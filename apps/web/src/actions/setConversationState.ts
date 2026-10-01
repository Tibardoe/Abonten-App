"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { setConversationStateCore } from "@abonten/services/messaging/conversationStateCore";
import { setConversationStateSchema } from "@abonten/validation/messageSchema";

/**
 * Mute / unmute or archive / unarchive a conversation for the caller only
 * (per-participant state). Shares its body with
 * POST /api/mobile/messages/state.
 */
export const setConversationState = withActionLocale(
  async function setConversationState(input: {
    conversationId: string;
    muted?: boolean;
    archived?: boolean;
  }) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { status: 401, message: tr("userNotLoggedIn") };
    }

    const parsed = setConversationStateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("invalidRequest"),
      };
    }

    return setConversationStateCore(supabase, user.id, parsed.data);
  },
);
