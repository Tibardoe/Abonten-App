"use server";

import { createClient } from "@/config/supabase/server";
import { blockParticipantCore } from "@abonten/services/messaging/conversationStateCore";
import { blockParticipantSchema } from "@abonten/validation/messageSchema";

/**
 * Block / unblock another participant in a conversation. Enforced
 * server-side by the send_message RPC: once a block exists in either
 * direction, no one in that pair can send. Shares its body with
 * POST /api/mobile/messages/block.
 */
export async function blockConversationParticipant(input: {
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
    return { status: 401, message: "User not logged in" };
  }

  const parsed = blockParticipantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  return blockParticipantCore(supabase, user.id, parsed.data);
}
