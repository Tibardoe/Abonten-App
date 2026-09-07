import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { sendMessageCore } from "@abonten/services/messaging/sendMessageCore";
import { sendMessageSchema } from "@abonten/validation/messageSchema";

// POST /api/mobile/messages/send
//   { conversationId, content?, clientGeneratedId?, replyToMessageId?,
//     messageType?, attachments? }
// Idempotent on clientGeneratedId. Mirrors the sendMessage Server Action.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return apiJson({ status: 400, message: "Invalid request body" });

    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? "Invalid message.",
      });
    }

    const result = await sendMessageCore(auth.supabase, auth.user.id, {
      conversationId: parsed.data.conversationId,
      content: parsed.data.content,
      clientGeneratedId: parsed.data.clientGeneratedId ?? null,
      replyToMessageId: parsed.data.replyToMessageId ?? null,
      messageType: parsed.data.messageType,
      attachments: parsed.data.attachments,
    });
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /messages/send failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
