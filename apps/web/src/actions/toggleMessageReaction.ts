"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import { toggleReactionCore } from "@abonten/services/messaging/reactionMutationsCore";
import { toggleMessageReactionSchema } from "@abonten/validation/messageSchema";

/**
 * Add or remove the caller's reaction on one message. Idempotent toggle —
 * authorization (participant-only, fixed emoji palette) lives in the
 * toggle_message_reaction RPC. Shares its body with
 * POST /api/mobile/messages/react.
 */
export async function toggleMessageReaction(input: {
  messageId: string;
  emoji: string;
}): Promise<{ status: number; message?: string; data?: { added: boolean } }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const parsed = toggleMessageReactionSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, message: "Invalid request." };
  }

  try {
    return await toggleReactionCore(supabase, user.id, parsed.data);
  } catch (error) {
    logger.error("toggleMessageReaction failed", error);
    return { status: 500, message: "Something went wrong. Please try again." };
  }
}
