import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import { logger } from "@abonten/core/logger";
import { verifyPaystackPaymentCore } from "@abonten/services/payments/verifyPaystackPaymentCore";

// POST /api/mobile/payments/verify  { paymentAttemptId: string }
//
// Optimistic client-triggered finalization, racing the Paystack webhook via
// the same finalizePaystackPayment(). 200 = tickets issued; 202 = still
// pending (poll again); 400 = payment failed; 207 = paid but ticket
// issuance failed.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      paymentAttemptId?: unknown;
    } | null;

    if (
      typeof body?.paymentAttemptId !== "string" ||
      body.paymentAttemptId.length === 0
    ) {
      return apiJson({ status: 400, message: "paymentAttemptId is required" });
    }

    const result = await verifyPaystackPaymentCore(
      auth.supabase,
      auth.user.id,
      body.paymentAttemptId,
      paymentFulfillmentDeps,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /payments/verify failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
