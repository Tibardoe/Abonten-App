import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { markNotificationReadFor } from "@/utils/notificationsQuery";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/notifications/read  { "notificationId": "<uuid>" }
// Marks one of the caller's own notifications read.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      notificationId?: unknown;
    } | null;
    const notificationId = body?.notificationId;

    if (typeof notificationId !== "string" || notificationId.length === 0) {
      return apiJson({ status: 400, message: "notificationId is required" });
    }

    const result = await markNotificationReadFor(
      auth.supabase,
      auth.user.id,
      notificationId,
    );

    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /notifications/read failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
