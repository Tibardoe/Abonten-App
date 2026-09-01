import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { retryPaymentFulfillmentCore } from "@/utils/retryPaymentFulfillmentCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/payments/retry  { paymentAttemptId: string }
//
// Recovery for the "paid but ticket issuance failed" state (a 207 from
// /payments/verify). Never re-charges — re-runs the same
// finalizePaystackPayment pipeline. 200 = tickets issued; 202 = still
// working (retry shortly); 207 = issuance still failing; 400 = payment
// failed.
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

    const result = await retryPaymentFulfillmentCore(
      auth.supabase,
      auth.user.id,
      body.paymentAttemptId,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /payments/retry failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
