import requestPhoneVerification from "@/actions/requestPhoneVerification";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/auth/phone/request  { "dialCode": "+233", "rawPhone": "24..." }
// Unauthenticated by design (pre-login), same as the web AuthModal. The
// per-phone resend cooldown and per-IP send cap live inside the action.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      dialCode?: unknown;
      rawPhone?: unknown;
    } | null;

    const dialCode = body?.dialCode;
    const rawPhone = body?.rawPhone;

    if (typeof dialCode !== "string" || typeof rawPhone !== "string") {
      return apiJson({
        status: 400,
        message: "dialCode and rawPhone are required",
      });
    }

    const result = await requestPhoneVerification(
      dialCode,
      rawPhone,
      "sign-in",
    );

    if (result.status === 200) {
      return apiJson({ status: 200, data: { phoneE164: result.phoneE164 } });
    }

    return apiJson({ status: result.status, message: result.message });
  } catch (error) {
    logger.error("mobile POST /auth/phone/request failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
