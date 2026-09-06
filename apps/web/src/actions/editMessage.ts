"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import { editMessageCore } from "@abonten/services/messaging/messageMutationsCore";
import { editMessageSchema } from "@abonten/validation/messageSchema";

/**
 * Edit one of the caller's own text messages, within the 15-minute window
 * (enforced in the edit_message RPC). Shares its body with
 * PATCH /api/mobile/messages/:messageId.
 */
export async function editMessage(input: {
  messageId: string;
  content: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const parsed = editMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid message.",
    };
  }

  try {
    return await editMessageCore(supabase, user.id, parsed.data);
  } catch (error) {
    logger.error("editMessage failed", error);
    return { status: 500, message: "Something went wrong. Please try again." };
  }
}
