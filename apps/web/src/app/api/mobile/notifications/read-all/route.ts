import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { markAllNotificationsReadFor } from "@/utils/notificationsQuery";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/notifications/read-all
// Marks every unread notification of the caller read.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await markAllNotificationsReadFor(
      auth.supabase,
      auth.user.id,
    );

    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /notifications/read-all failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
