import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getPromotionCreditCore } from "@abonten/services/rewards/promotionCreditCore";

// GET /api/mobile/rewards/promotion-credit
// The caller's promotion credit and monthly rebates (organizer finance
// screen). Same service as the getPromotionCredit Server Action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    return fromActionResult(
      await getPromotionCreditCore(auth.supabase, auth.user.id),
    );
  } catch (error) {
    logger.error("mobile GET /rewards/promotion-credit failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
