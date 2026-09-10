import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import { logger } from "@abonten/core/logger";
import { createPromotionPaymentAttemptCore } from "@abonten/services/payments/createPromotionPaymentAttemptCore";

// POST /api/mobile/checkout/promotion-attempt
//   { eventPromotionCheckoutId: string, paymentMethodId?: string, useCredit?: boolean }
//
// Starts paying for a pending event-promotion checkout — same service as
// the web createPromotionPaymentAttempt action. `data.paystack.mode` is
// "direct" (approve on the phone, maybe an OTP via /payments/charge-otp) or
// "popup" (open `authorizationUrl`); completion is the shared
// /api/mobile/payments/verify → finalizePaystackPayment → activateEventPromotion
// path. With `useCredit` the server applies the quoted Abonten Credit; when
// it covers everything `data.paystack` is null (no paymentMethodId needed)
// and `data.verification` already holds the outcome.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      eventPromotionCheckoutId?: unknown;
      paymentMethodId?: unknown;
      useCredit?: unknown;
    } | null;

    const checkoutId =
      typeof body?.eventPromotionCheckoutId === "string" &&
      body.eventPromotionCheckoutId.length > 0
        ? body.eventPromotionCheckoutId
        : null;
    const paymentMethodId =
      typeof body?.paymentMethodId === "string" &&
      body.paymentMethodId.length > 0
        ? body.paymentMethodId
        : null;
    const useCredit = body?.useCredit === true;

    if (!checkoutId || (!paymentMethodId && !useCredit)) {
      return apiJson({
        status: 400,
        message: "eventPromotionCheckoutId and paymentMethodId are required",
      });
    }

    const result = await createPromotionPaymentAttemptCore(
      auth.supabase,
      auth.user.id,
      auth.user.email,
      { kind: "event", checkoutId, paymentMethodId, useCredit },
      (id) => `abonten://promotion/${id}`,
      paymentFulfillmentDeps,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /checkout/promotion-attempt failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
