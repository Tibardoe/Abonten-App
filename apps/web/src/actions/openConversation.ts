"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import { openConversationCore } from "@abonten/services/messaging/openConversationCore";
import type { OpenConversationInput } from "@abonten/types/messagingType";
import { openConversationSchema } from "@abonten/validation/messageSchema";

/**
 * "Chat with organizer" / "Chat with place" — resolves to the single
 * canonical conversation for (this user, this subject), creating it on the
 * first call. Idempotent: tapping the button again returns the same id, so
 * the UI can always `router.push("/messages/" + conversationId)`.
 *
 * Shares its body with POST /api/mobile/messages/open via
 * @abonten/services/messaging/openConversationCore.
 */
export async function openConversation(input: OpenConversationInput) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: 401, message: "Please sign in to send a message." };
  }

  const parsed = openConversationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  try {
    return await openConversationCore(supabase, user.id, parsed.data);
  } catch (error) {
    logger.error("openConversation failed", error);
    return { status: 500, message: "Something went wrong. Please try again." };
  }
}
