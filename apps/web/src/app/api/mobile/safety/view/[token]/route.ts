import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { getSafetyViewCore } from "@abonten/services/safety/safetyViewCore";
import { safetyTokenSchema } from "@abonten/validation/safetySchemas";

// GET /api/mobile/safety/view/[token]
// A contact's live view of an alert they were sent (no account needed; the token is theirs).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  bindLocaleFromRequest(req);
  const { token } = await params;
  const res = await discoveryRoute(
    req,
    {
      schema: safetyTokenSchema,
      label: "GET /safety/view/[token]",
      allowAnonymous: true,
      params: { token: token },
    },
    ({ svc, data, ip }) => getSafetyViewCore(svc, data.token, { ip }),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
