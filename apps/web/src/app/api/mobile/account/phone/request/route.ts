import requestPhoneVerification from "@/actions/requestPhoneVerification";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/account/phone/request  { dialCode, rawPhone }
// Sends a Hubtel OTP for an already-signed-in user changing/adding their
// phone number (purpose "phone-update", distinct from the pre-login
// "sign-in" flow at /api/mobile/auth/phone/request). The per-phone resend
// cooldown + per-IP send cap live inside the action; the requestId/prefix
// Hubtel returns stay server-side.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      dialCode?: unknown;
      rawPhone?: unknown;
    } | null;

    if (
      typeof body?.dialCode !== "string" ||
      typeof body?.rawPhone !== "string"
    ) {
      return apiJson({
        status: 400,
        message: "dialCode and rawPhone are required",
      });
    }

    const result = await requestPhoneVerification(
      body.dialCode,
      body.rawPhone,
      "phone-update",
    );

    if (result.status === 200) {
      return apiJson({ status: 200, data: { phoneE164: result.phoneE164 } });
    }
    return apiJson({ status: result.status, message: result.message });
  } catch (error) {
    logger.error("mobile POST /account/phone/request failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
