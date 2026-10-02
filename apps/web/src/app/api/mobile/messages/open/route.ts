import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { openConversationCore } from "@abonten/services/messaging/openConversationCore";
import { openConversationSchema } from "@abonten/validation/messageSchema";

// POST /api/mobile/messages/open
//   { type: "event", eventId } | { type: "place", placeId } | { type: "support" }
// Get-or-create the caller's conversation for a subject. Idempotent — the
// same body always returns the same conversationId. Mirrors the
// openConversation Server Action.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body)
      return apiJson({
        status: 400,
        message: tr("invalidRequestBody"),
      });

    const parsed = openConversationSchema.safeParse(body);
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("invalidRequest"),
      });
    }

    const result = await openConversationCore(
      auth.supabase,
      auth.user.id,
      parsed.data,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /messages/open failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
