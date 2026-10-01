import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { deleteMessageCore } from "@abonten/services/messaging/messageMutationsCore";
import { z } from "zod";

const schema = z.object({ messageId: z.string().uuid() });

// POST /api/mobile/messages/delete  { messageId }
// Author-only soft delete, idempotent. Mirrors the deleteMessage Server Action.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiJson({ status: 400, message: tr("invalidRequest") });
    }

    const result = await deleteMessageCore(
      auth.supabase,
      auth.user.id,
      parsed.data,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /messages/delete failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
