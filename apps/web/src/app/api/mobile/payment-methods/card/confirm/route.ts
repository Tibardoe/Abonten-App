import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { confirmCardVerificationCore } from "@abonten/services/payments/cardVerificationCore";

// POST /api/mobile/payment-methods/card/confirm  { reference: string, label?: string }
//
// Completes the card save after the verification popup closes:
// independently verifies the charge, captures the reusable authorization,
// refunds the GHS 1, saves the card. Same confirmCardVerificationCore the
// web action runs. 200 = card saved (returns the PaymentMethodRow).
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  if (!auth.user.email) {
    return apiJson({ status: 401, message: "No email on this account" });
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      reference?: unknown;
      label?: unknown;
    } | null;

    if (typeof body?.reference !== "string" || body.reference.length === 0) {
      return apiJson({ status: 400, message: "reference is required" });
    }

    const label =
      typeof body.label === "string" && body.label.trim().length > 0
        ? body.label.trim()
        : undefined;

    const result = await confirmCardVerificationCore(
      auth.supabase,
      auth.user.id,
      auth.user.email,
      body.reference,
      label,
    );
    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /payment-methods/card/confirm failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
