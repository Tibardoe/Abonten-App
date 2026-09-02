import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { createPromotionPaymentAttemptCore } from "@abonten/services/payments/createPromotionPaymentAttemptCore";

// POST /api/mobile/checkout/place-promotion-attempt
//   { placePromotionCheckoutId: string, paymentMethodId: string }
//
// The place sibling of /checkout/promotion-attempt — records a
// payment_attempt against a pending place-promotion checkout and starts the
// Paystack charge (createPromotionPaymentAttemptCore, kind "place"). The
// completion path is the shared /api/mobile/payments/verify ->
// finalizePaystackPayment -> activatePlacePromotion (finalize already
// dispatches on the place_promotion_checkout_id column, no place-specific
// verify needed).
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      placePromotionCheckoutId?: unknown;
      paymentMethodId?: unknown;
    } | null;

    const checkoutId =
      typeof body?.placePromotionCheckoutId === "string" &&
      body.placePromotionCheckoutId.length > 0
        ? body.placePromotionCheckoutId
        : null;
    const paymentMethodId =
      typeof body?.paymentMethodId === "string" &&
      body.paymentMethodId.length > 0
        ? body.paymentMethodId
        : null;

    if (!checkoutId || !paymentMethodId) {
      return apiJson({
        status: 400,
        message: "placePromotionCheckoutId and paymentMethodId are required",
      });
    }

    const result = await createPromotionPaymentAttemptCore(
      auth.supabase,
      auth.user.id,
      auth.user.email,
      { kind: "place", checkoutId, paymentMethodId },
      (id) => `abonten://promotion/${id}`,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /checkout/place-promotion-attempt failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
