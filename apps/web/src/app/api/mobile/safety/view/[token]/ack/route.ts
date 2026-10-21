import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { acknowledgeSafetyAlertCore } from "@abonten/services/safety/safetyViewCore";
import { acknowledgeSafetyAlertSchema } from "@abonten/validation/safetySchemas";

// POST /api/mobile/safety/view/[token]/ack
// A contact answers: on my way, calling, or can't help right now.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  bindLocaleFromRequest(req);
  const { token } = await params;
  const res = await discoveryRoute(
    req,
    {
      schema: acknowledgeSafetyAlertSchema,
      label: "POST /safety/view/[token]/ack",
      allowAnonymous: true,
      params: { token: token },
    },
    ({ svc, data, ip }) => acknowledgeSafetyAlertCore(svc, data, { ip }),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
