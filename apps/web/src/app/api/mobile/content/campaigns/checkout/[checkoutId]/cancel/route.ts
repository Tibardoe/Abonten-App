import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { cancelPromotionCheckout } from "@abonten/services/checkout/checkoutCancellation";

// POST /api/mobile/content/campaigns/checkout/[checkoutId]/cancel
// Cancels a pending, unpaid campaign checkout — same service as the web
// cancelContentCampaignCheckout action (never cancels out from under an
// in-flight payment).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ checkoutId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const { checkoutId } = await params;
    return fromActionResult(
      await cancelPromotionCheckout(
        auth.supabase,
        "content_campaign_checkout",
        "content_campaign_checkout_id",
        checkoutId,
        auth.user.id,
      ),
    );
  } catch (error) {
    logger.error(
      "mobile POST /content/campaigns/checkout/cancel failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
