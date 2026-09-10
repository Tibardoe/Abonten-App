import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getPromotionCreditQuoteCore } from "@abonten/services/rewards/creditRedemptionCore";

// GET /api/mobile/checkout/promotion-credit-quote?kind=event|place&checkoutId=…
// How much Abonten Credit the "Use credit" switch can apply to a pending
// promotion checkout. Same service as the getPromotionCreditQuote action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const checkoutId = url.searchParams.get("checkoutId");

    if ((kind !== "event" && kind !== "place") || !checkoutId) {
      return apiJson({
        status: 400,
        message: "kind (event | place) and checkoutId are required",
      });
    }

    return fromActionResult(
      await getPromotionCreditQuoteCore(auth.supabase, auth.user.id, {
        kind,
        checkoutId,
      }),
    );
  } catch (error) {
    logger.error("mobile GET /checkout/promotion-credit-quote failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
