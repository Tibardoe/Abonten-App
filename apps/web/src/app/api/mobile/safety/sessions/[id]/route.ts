import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { updateSafetySessionCore } from "@abonten/services/safety/safetySessionCore";
import { updateSafetySessionSchema } from "@abonten/validation/safetySchemas";

// PATCH /api/mobile/safety/sessions/[id]
// A note for the contacts, or more time on a check-in.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  bindLocaleFromRequest(req);
  const { id } = await params;
  const res = await discoveryRoute(
    req,
    {
      schema: updateSafetySessionSchema,
      label: "PATCH /safety/sessions/[id]",
      params: { sessionId: id },
    },
    ({ svc, userId, data }) =>
      updateSafetySessionCore(svc, signedIn(userId), data),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
