import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { submitPaystackChargeOtpCore } from "@/utils/submitPaystackChargeOtpCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/payments/charge-otp  { paymentAttemptId: string, otp: string }
//
// Completes a direct charge that returned Paystack's "send_otp" status
// (some Ghana mobile money charges). After a 200 here, poll /payments/verify.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      paymentAttemptId?: unknown;
      otp?: unknown;
    } | null;

    if (
      typeof body?.paymentAttemptId !== "string" ||
      body.paymentAttemptId.length === 0
    ) {
      return apiJson({ status: 400, message: "paymentAttemptId is required" });
    }
    if (typeof body?.otp !== "string" || body.otp.trim().length === 0) {
      return apiJson({ status: 400, message: "otp is required" });
    }

    const result = await submitPaystackChargeOtpCore(
      auth.supabase,
      auth.user.id,
      body.paymentAttemptId,
      body.otp.trim(),
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /payments/charge-otp failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
