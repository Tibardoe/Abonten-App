import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { fetchEventPromotionContext } from "@/utils/fetchEventPromotionContext";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/organizer/events/:eventId/promotion
// The Promotion tab payload: seeded tiers, the current active promotion (if
// any), and whether a new promotion would be ineligible. 403 if the event
// isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { eventId } = await params;
    if (!eventId) {
      return apiJson({ status: 400, message: "Missing event id" });
    }

    const result = await fetchEventPromotionContext(
      auth.supabase,
      auth.user.id,
      eventId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile GET /organizer/events/:eventId/promotion failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
