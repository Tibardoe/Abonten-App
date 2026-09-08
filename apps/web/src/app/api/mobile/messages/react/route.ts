import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { toggleReactionCore } from "@abonten/services/messaging/reactionMutationsCore";
import { toggleMessageReactionSchema } from "@abonten/validation/messageSchema";

// POST /api/mobile/messages/react  { messageId, emoji }
// Idempotent toggle of the caller's reaction. Mirrors the
// toggleMessageReaction Server Action.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const parsed = toggleMessageReactionSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiJson({ status: 400, message: "Invalid request." });
    }

    const result = await toggleReactionCore(
      auth.supabase,
      auth.user.id,
      parsed.data,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /messages/react failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
