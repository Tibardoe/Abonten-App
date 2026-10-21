import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { safetyDeps } from "@/utils/sendSafetyEmail";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { resolveSafetySessionCore } from "@abonten/services/safety/safetySessionCore";
import { resolveSafetySessionSchema } from "@abonten/validation/safetySchemas";

// POST /api/mobile/safety/sessions/[id]/resolve
// "I'm safe", "That was a mistake" or "Stop sharing".
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  bindLocaleFromRequest(req);
  const { id } = await params;
  const res = await discoveryRoute(
    req,
    {
      schema: resolveSafetySessionSchema,
      label: "POST /safety/sessions/[id]/resolve",
      params: { sessionId: id },
    },
    ({ svc, userId, data }) =>
      resolveSafetySessionCore(svc, signedIn(userId), data, safetyDeps),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
