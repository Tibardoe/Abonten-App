import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { blockParticipantCore } from "@abonten/services/messaging/conversationStateCore";
import { blockParticipantSchema } from "@abonten/validation/messageSchema";

// POST /api/mobile/messages/block  { conversationId, blockedUserId, block }
// Block / unblock another participant. Mirrors the
// blockConversationParticipant Server Action.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const parsed = blockParticipantSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? "Invalid request.",
      });
    }

    const result = await blockParticipantCore(
      auth.supabase,
      auth.user.id,
      parsed.data,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /messages/block failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
