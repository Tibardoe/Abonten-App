import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { fetchEventPromoCodes } from "@/utils/eventPromoCodeManageCore";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/organizer/events/:eventId/promo-codes
// The caller's own event's promo codes, newest first, with usage counts —
// same body as getEventPromoCodes. 403 if the event isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { eventId } = await params;
    const result = await fetchEventPromoCodes(
      auth.supabase,
      auth.user.id,
      eventId,
    );
    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /organizer/events/:id/promo-codes failed", error);
    return apiJson({ status: 500, message: "Something went wrong!", data: [] });
  }
}
