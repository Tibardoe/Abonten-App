import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { withLegacyPaystackField } from "@/app/api/mobile/_lib/legacyPaymentField";
import { paymentChoiceFromBody } from "@/app/api/mobile/_lib/paymentChoiceBody";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import { logger } from "@abonten/core/logger";
import { createPromotionPaymentAttemptCore } from "@abonten/services/payments/createPromotionPaymentAttemptCore";

// POST /api/mobile/checkout/place-promotion-attempt
//   { placePromotionCheckoutId: string, paymentMethodId?: string, useCredit?: boolean }
//
// The place sibling of /checkout/promotion-attempt — starts paying for a
// pending place-promotion checkout (createPromotionPaymentAttemptCore, kind
// "place"). The completion path is the shared /api/mobile/payments/verify ->
// finalizePayment -> activatePlacePromotion (finalize already
// dispatches on the place_promotion_checkout_id column, no place-specific
// verify needed). `useCredit` behaves as on the event route.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      placePromotionCheckoutId?: unknown;
      paymentMethodId?: unknown;
      method?: unknown;
      useCredit?: unknown;
    } | null;

    const checkoutId =
      typeof body?.placePromotionCheckoutId === "string" &&
      body.placePromotionCheckoutId.length > 0
        ? body.placePromotionCheckoutId
        : null;
    const choice = paymentChoiceFromBody(req, body);
    const useCredit = body?.useCredit === true;

    if (
      !checkoutId ||
      (!choice.paymentMethodId && !choice.method && !useCredit)
    ) {
      return apiJson({
        status: 400,
        message: "placePromotionCheckoutId and paymentMethodId are required",
      });
    }

    const result = await createPromotionPaymentAttemptCore(
      auth.supabase,
      auth.user.id,
      auth.user.email,
      { kind: "place", checkoutId, ...choice, useCredit },
      (id) => `abonten://promotion/${id}`,
      paymentFulfillmentDeps,
    );

    return fromActionResult(withLegacyPaystackField(result));
  } catch (error) {
    logger.error("mobile POST /checkout/place-promotion-attempt failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
