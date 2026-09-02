import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { createPromotionPaymentAttemptCore } from "@abonten/services/payments/createPromotionPaymentAttemptCore";

// POST /api/mobile/checkout/promotion-attempt
//   { eventPromotionCheckoutId: string, paymentMethodId: string }
//
// Records a payment_attempt against a pending event-promotion checkout and
// starts the Paystack charge — same steps createPaymentAttempt's promotion
// branch runs. `data.paystack.mode` is "direct" (approve on the phone, maybe
// an OTP via /payments/charge-otp) or "popup" (open `authorizationUrl`).
// Completion is the shared /api/mobile/payments/verify → finalizePaystackPayment
// → activateEventPromotion path (no promotion-specific verify needed).
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      eventPromotionCheckoutId?: unknown;
      paymentMethodId?: unknown;
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

    if (!checkoutId || !paymentMethodId) {
      return apiJson({
        status: 400,
        message: "eventPromotionCheckoutId and paymentMethodId are required",
      });
    }

    const result = await createPromotionPaymentAttemptCore(
      auth.supabase,
      auth.user.id,
      auth.user.email,
      { kind: "event", checkoutId, paymentMethodId },
      (id) => `abonten://promotion/${id}`,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /checkout/promotion-attempt failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
