import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { editMessageCore } from "@abonten/services/messaging/messageMutationsCore";
import { editMessageSchema } from "@abonten/validation/messageSchema";

// POST /api/mobile/messages/edit  { messageId, content }
// Author-only, 15-minute window. Mirrors the editMessage Server Action.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return apiJson({ status: 400, message: "Invalid request body" });

    const parsed = editMessageSchema.safeParse(body);
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? "Invalid message.",
      });
    }

    const result = await editMessageCore(
      auth.supabase,
      auth.user.id,
      parsed.data,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /messages/edit failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
