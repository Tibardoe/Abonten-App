"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import { deleteMessageCore } from "@abonten/services/messaging/messageMutationsCore";
import { z } from "zod";

const schema = z.object({ messageId: z.string().uuid() });

/**
 * Soft-delete one of the caller's own messages (author-only, idempotent —
 * enforced in the delete_message RPC). The row is kept for moderation; the
 * UI renders a "message deleted" placeholder. Shares its body with
 * DELETE /api/mobile/messages/:messageId.
 */
export async function deleteMessage(input: { messageId: string }) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, message: "Invalid request." };
  }

  try {
    return await deleteMessageCore(supabase, user.id, parsed.data);
  } catch (error) {
    logger.error("deleteMessage failed", error);
    return { status: 500, message: "Something went wrong. Please try again." };
  }
}
