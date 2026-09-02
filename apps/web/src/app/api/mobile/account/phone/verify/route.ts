import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { updateVerifiedPhoneCore } from "@abonten/services/profile/updateVerifiedPhoneCore";

// POST /api/mobile/account/phone/verify  { phoneE164, code }
// Confirms the Hubtel OTP and attaches the verified number to the caller
// (Admin API). Same core the web updateVerifiedPhone Server Action delegates
// to — the number is never marked verified before Hubtel confirms it.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      phoneE164?: unknown;
      code?: unknown;
    } | null;

    if (typeof body?.phoneE164 !== "string" || typeof body?.code !== "string") {
      return apiJson({
        status: 400,
        message: "phoneE164 and code are required",
      });
    }

    const result = await updateVerifiedPhoneCore(
      auth.user.id,
      body.phoneE164,
      body.code,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /account/phone/verify failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
