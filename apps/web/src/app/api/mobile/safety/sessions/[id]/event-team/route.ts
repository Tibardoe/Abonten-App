import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { safetyDeps } from "@/utils/sendSafetyEmail";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { tellEventTeamCore } from "@abonten/services/safety/safetySessionCore";
import { safetySessionIdSchema } from "@abonten/validation/safetySchemas";

// POST /api/mobile/safety/sessions/[id]/event-team
// Tells the organizer of the event the alert is about.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  bindLocaleFromRequest(req);
  const { id } = await params;
  const res = await discoveryRoute(
    req,
    {
      schema: safetySessionIdSchema,
      label: "POST /safety/sessions/[id]/event-team",
      params: { sessionId: id },
    },
    ({ svc, userId, data }) =>
      tellEventTeamCore(svc, signedIn(userId), data.sessionId, safetyDeps),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
