"use server";

import { createClient } from "@/config/supabase/server";
import { markConversationReadCore } from "@abonten/services/messaging/conversationStateCore";
import { z } from "zod";

const schema = z.object({
  conversationId: z.string().uuid(),
  upTo: z.string().datetime().nullish(),
});

/**
 * Advance the caller's read position in a conversation (drives unread counts
 * + read receipts). Only ever touches the caller's own participant row.
 * Shares its body with POST /api/mobile/messages/read.
 */
export async function markConversationRead(input: {
  conversationId: string;
  upTo?: string | null;
}) {
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

  return markConversationReadCore(supabase, user.id, {
    conversationId: parsed.data.conversationId,
    upTo: parsed.data.upTo ?? null,
  });
}
