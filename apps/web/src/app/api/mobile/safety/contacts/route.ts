import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { safetyDeps } from "@/utils/sendSafetyEmail";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { addSafetyContactCore } from "@abonten/services/safety/safetyContactsCore";
import { addSafetyContactSchema } from "@abonten/validation/safetySchemas";

// POST /api/mobile/safety/contacts
// Adds a trusted contact and texts them the invite (same core as the web addSafetyContact action).
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const res = await discoveryRoute(
    req,
    {
      schema: addSafetyContactSchema,
      label: "POST /safety/contacts",
    },
    ({ svc, userId, data }) =>
      addSafetyContactCore(svc, signedIn(userId), data, safetyDeps),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
