import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getUnreadMessageCount } from "@abonten/services/messaging/conversationsQuery";

// GET /api/mobile/messages/unread-count
// Global unread-conversation count for the Messages tab badge.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await getUnreadMessageCount(auth.supabase, auth.user.id);
    return apiJson({
      status: result.status,
      message: result.message,
      data: { count: result.count },
    });
  } catch (error) {
    logger.error("mobile GET /messages/unread-count failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
