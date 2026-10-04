import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { suggestPlacesCore } from "@abonten/services/geo/placeSuggestions";
import {
  bindLocaleFromRequest,
  requestLocale,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { addressSuggestSchema } from "@abonten/validation/addressSchemas";

// GET /api/mobile/addresses/suggest?q=&session=&lat=&lng=
// Address suggestions while someone types a location (browsing area,
// event and place forms). Google bills each call, so it is rate limited per
// caller and across every caller. Signed-out use is allowed: choosing where
// to browse comes before signing in.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: addressSuggestSchema,
      label: "GET /addresses/suggest",
      allowAnonymous: true,
    },
    async ({ userId, data, ip }) => {
      const caller = userId ? `user:${userId}` : `ip:${ip}`;
      if (
        !(await checkRateLimit(`address-suggest:${caller}`, 120, 60)) ||
        !(await checkRateLimit("address-suggest:all", 3000, 60))
      ) {
        return { status: 429, message: tr("slowDownALittle") };
      }
      return suggestPlacesCore({ ...data, locale: requestLocale() });
    },
  );
}
