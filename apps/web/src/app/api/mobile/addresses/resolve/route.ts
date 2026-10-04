import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { resolvePlaceCore } from "@abonten/services/geo/placeSuggestions";
import {
  bindLocaleFromRequest,
  requestLocale,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { addressResolveSchema } from "@abonten/validation/addressSchemas";

// GET /api/mobile/addresses/resolve?placeId=&session=
// The location and address of the suggestion someone picked; it ends the
// suggestion session the app opened. Rate limited like /suggest.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: addressResolveSchema,
      label: "GET /addresses/resolve",
      allowAnonymous: true,
    },
    async ({ userId, data, ip }) => {
      const caller = userId ? `user:${userId}` : `ip:${ip}`;
      if (
        !(await checkRateLimit(`address-resolve:${caller}`, 30, 60)) ||
        !(await checkRateLimit("address-resolve:all", 1000, 60))
      ) {
        return { status: 429, message: tr("slowDownALittle") };
      }
      return resolvePlaceCore({ ...data, locale: requestLocale() });
    },
  );
}
