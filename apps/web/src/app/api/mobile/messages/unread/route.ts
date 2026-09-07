import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { markConversationUnreadCore } from "@abonten/services/messaging/conversationStateCore";
import { markConversationUnreadSchema } from "@abonten/validation/messageSchema";

// POST /api/mobile/messages/unread  { conversationId }
// Rewind the caller's read cursor so the conversation reads as unread
// again. Mirrors the markConversationUnread action.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const parsed = markConversationUnreadSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiJson({ status: 400, message: "Invalid request." });
    }

    const result = await markConversationUnreadCore(
      auth.supabase,
      auth.user.id,
      { conversationId: parsed.data.conversationId },
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /messages/unread failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
