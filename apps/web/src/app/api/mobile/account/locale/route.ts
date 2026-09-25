import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  getLocalePreferencesCore,
  updateLocalePreferencesCore,
} from "@abonten/services/markets/localePreferencesCore";
import type { LocalePreferencesPatch } from "@abonten/types/marketType";

// GET   /api/mobile/account/locale  -> the signed-in person's home market,
//                                      estimate currency, distance unit, locale
// PATCH /api/mobile/account/locale  { countryCode?, displayCurrency?,
//                                      distanceUnit?, locale? }
// Same service as the web getLocalePreferences / updateLocalePreferences
// actions. The home market must be an open market; it is written with the
// service role (clients cannot write user_info.country_code directly).
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    return apiJson(await getLocalePreferencesCore(auth.user.id));
  } catch (error) {
    logger.error("mobile GET /account/locale failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}

export async function PATCH(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object") {
      return apiJson({ status: 400, message: "Nothing to update." });
    }
    const str = (v: unknown) =>
      typeof v === "string" ? v : v === null ? null : undefined;
    const patch: LocalePreferencesPatch = {};
    if ("countryCode" in body) patch.countryCode = str(body.countryCode);
    if ("displayCurrency" in body)
      patch.displayCurrency = str(body.displayCurrency);
    if ("locale" in body) patch.locale = str(body.locale);
    if ("distanceUnit" in body) {
      const unit = body.distanceUnit;
      patch.distanceUnit = unit === "km" || unit === "mi" ? unit : null;
    }
    return apiJson(await updateLocalePreferencesCore(auth.user.id, patch));
  } catch (error) {
    logger.error("mobile PATCH /account/locale failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
