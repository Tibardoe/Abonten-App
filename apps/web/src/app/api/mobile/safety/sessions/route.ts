import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { safetyDeps } from "@/utils/sendSafetyEmail";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { startSafetySessionCore } from "@abonten/services/safety/safetySessionCore";
import { startSafetySessionSchema } from "@abonten/validation/safetySchemas";

// POST /api/mobile/safety/sessions
// SOS, a check-in or a location share. The same clientRequestId twice is one session.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const res = await discoveryRoute(
    req,
    {
      schema: startSafetySessionSchema,
      label: "POST /safety/sessions",
    },
    ({ svc, userId, data }) =>
      startSafetySessionCore(svc, signedIn(userId), data, {
        createdVia: "app",
        deps: safetyDeps,
      }),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
