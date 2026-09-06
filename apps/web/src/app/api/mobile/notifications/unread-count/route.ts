import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { unreadNotificationCountFor } from "@abonten/services/notifications/notificationsQuery";

// GET /api/mobile/notifications/unread-count
// Count of the caller's unread notifications — backs the header bell badge.
// Same query body as the web getUnreadNotificationCount Server Action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await unreadNotificationCountFor(
      auth.supabase,
      auth.user.id,
    );
    if (result.status !== 200) {
      return apiJson({ status: result.status, message: result.message });
    }
    return apiJson({ status: 200, data: { count: result.count } });
  } catch (error) {
    logger.error("mobile GET /notifications/unread-count failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
