import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { recordSafetyLocationCore } from "@abonten/services/safety/safetySessionCore";
import { recordSafetyLocationSchema } from "@abonten/validation/safetySchemas";

// POST /api/mobile/safety/sessions/[id]/location
// Positions while a session is open (at most 20 a request).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  bindLocaleFromRequest(req);
  const { id } = await params;
  const res = await discoveryRoute(
    req,
    {
      schema: recordSafetyLocationSchema,
      label: "POST /safety/sessions/[id]/location",
      params: { sessionId: id },
    },
    ({ svc, userId, data }) =>
      recordSafetyLocationCore(svc, signedIn(userId), data),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
