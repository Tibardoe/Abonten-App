"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import { sendMessageCore } from "@abonten/services/messaging/sendMessageCore";
import type { SendMessageInput } from "@abonten/types/messagingType";
import { sendMessageSchema } from "@abonten/validation/messageSchema";

/**
 * Send one message into a conversation the caller belongs to. The
 * send_message RPC does the participant / block / closed / rate-limit /
 * attachment-prefix checks and is idempotent on `clientGeneratedId` (so an
 * optimistic retry collapses onto the same row). Fans a best-effort
 * notification + push out to the other participants. Shares its body with
 * POST /api/mobile/messages/send.
 */
export const sendMessage = withActionLocale(async function sendMessage(
  input: SendMessageInput,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: 401, message: tr("pleaseSignInToSendA") };
  }

  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? tr("invalidMessage"),
    };
  }

  try {
    return await sendMessageCore(supabase, user.id, {
      conversationId: parsed.data.conversationId,
      content: parsed.data.content,
      clientGeneratedId: parsed.data.clientGeneratedId ?? null,
      replyToMessageId: parsed.data.replyToMessageId ?? null,
      messageType: parsed.data.messageType,
      attachments: parsed.data.attachments,
    });
  } catch (error) {
    logger.error("sendMessage failed", error);
    return {
      status: 500,
      message: tr("somethingWentWrongPleaseTryAgain"),
    };
  }
});
