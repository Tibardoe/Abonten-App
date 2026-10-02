"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { blockParticipantCore } from "@abonten/services/messaging/conversationStateCore";
import { blockParticipantSchema } from "@abonten/validation/messageSchema";

/**
 * Block / unblock another participant in a conversation. Enforced
 * server-side by the send_message RPC: once a block exists in either
 * direction, no one in that pair can send. Shares its body with
 * POST /api/mobile/messages/block.
 */
export const blockConversationParticipant = withActionLocale(
  async function blockConversationParticipant(input: {
    conversationId: string;
    blockedUserId: string;
    block: boolean;
  }) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { status: 401, message: tr("userNotLoggedIn") };
    }

    const parsed = blockParticipantSchema.safeParse(input);
    if (!parsed.success) {
      return {
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("invalidRequest"),
      };
    }

    return blockParticipantCore(supabase, user.id, parsed.data);
  },
);
