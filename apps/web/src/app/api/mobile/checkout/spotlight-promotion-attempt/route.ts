import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import { logger } from "@abonten/core/logger";
import { createPromotionPaymentAttemptCore } from "@abonten/services/payments/createPromotionPaymentAttemptCore";

// POST /api/mobile/checkout/spotlight-promotion-attempt
//   { contentCampaignCheckoutId: string, paymentMethodId: string }
//
// Starts paying for a pending promoted-Spotlight campaign checkout — same
// service as the event / place promotion attempts, with the fifth
// payment_attempt target. Cash only (Abonten Credit is refused for this
// kind); completion is the shared /api/mobile/payments/verify →
// finalizePaystackPayment → activateContentCampaign path, which leaves the
// campaign in review.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      contentCampaignCheckoutId?: unknown;
      paymentMethodId?: unknown;
    } | null;

    const checkoutId =
      typeof body?.contentCampaignCheckoutId === "string" &&
      body.contentCampaignCheckoutId.length > 0
        ? body.contentCampaignCheckoutId
        : null;
    const paymentMethodId =
      typeof body?.paymentMethodId === "string" &&
      body.paymentMethodId.length > 0
        ? body.paymentMethodId
        : null;

    if (!checkoutId || !paymentMethodId) {
      return apiJson({
        status: 400,
        message: "contentCampaignCheckoutId and paymentMethodId are required",
      });
    }

    const result = await createPromotionPaymentAttemptCore(
      auth.supabase,
      auth.user.id,
      auth.user.email,
      { kind: "spotlight", checkoutId, paymentMethodId, useCredit: false },
      (id) => `abonten://promotion/${id}`,
      paymentFulfillmentDeps,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /checkout/spotlight-promotion-attempt failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
