import { bearerFrom, getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { signOutOtherDevicesCore } from "@abonten/services/profile/signOutOtherDevicesCore";

// POST /api/mobile/devices/sign-out-others { keepDeviceToken }
// Settings › Security: ends every session of the caller except this phone's,
// and drops the push tokens of the devices it ended (this phone's stays).
// Twin of the web Server Action signOutOtherDevices.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  const body = (await req.json().catch(() => null)) as {
    keepDeviceToken?: unknown;
  } | null;

  try {
    const result = await signOutOtherDevicesCore(
      auth.user.id,
      bearerFrom(req) ?? "",
      { keepDeviceToken: body?.keepDeviceToken },
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /devices/sign-out-others failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
