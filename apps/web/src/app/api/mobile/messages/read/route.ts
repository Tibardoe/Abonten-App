import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { markConversationReadCore } from "@abonten/services/messaging/conversationStateCore";
import { z } from "zod";

const schema = z.object({
  conversationId: z.string().uuid(),
  upTo: z.string().datetime().nullish(),
});

// POST /api/mobile/messages/read  { conversationId, upTo? }
// Advance the caller's read position. Mirrors the markConversationRead action.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiJson({ status: 400, message: "Invalid request." });
    }

    const result = await markConversationReadCore(auth.supabase, auth.user.id, {
      conversationId: parsed.data.conversationId,
      upTo: parsed.data.upTo ?? null,
    });
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /messages/read failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
