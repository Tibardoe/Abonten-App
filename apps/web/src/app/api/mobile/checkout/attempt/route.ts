import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { createMultiCheckoutPaymentAttemptCore } from "@abonten/services/payments/createMultiCheckoutPaymentAttemptCore";

// POST /api/mobile/checkout/attempt
//   { checkoutSessionIds: string[], paymentMethodId: string }
//
// Records a payment_attempt per session (one paymentGroupId) and starts the
// Paystack charge — same createMultiCheckoutPaymentAttempt logic the web
// action runs. `data.paystack.mode` is "direct" (mobile money / saved card —
// the shopper approves on their phone, then maybe an OTP via
// /payments/charge-otp) or "popup" (open `authorizationUrl` in a browser).
// The Paystack callback is an `abonten://` deep link back to the checkout
// screen.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      checkoutSessionIds?: unknown;
      paymentMethodId?: unknown;
    } | null;

    const ids = body?.checkoutSessionIds;
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id) => typeof id === "string" && id.length > 0)
    ) {
      return apiJson({
        status: 400,
        message: "checkoutSessionIds must be a non-empty array of strings",
      });
    }

    if (
      typeof body?.paymentMethodId !== "string" ||
      body.paymentMethodId.length === 0
    ) {
      return apiJson({ status: 400, message: "paymentMethodId is required" });
    }

    const result = await createMultiCheckoutPaymentAttemptCore(
      auth.supabase,
      auth.user.id,
      auth.user.email,
      {
        checkoutSessionIds: ids as string[],
        paymentMethodId: body.paymentMethodId,
      },
      (checkoutSessionId) => `abonten://checkout/${checkoutSessionId}`,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /checkout/attempt failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
