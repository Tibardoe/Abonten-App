import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { ingestContentViewsCore } from "@abonten/services/content/contentTelemetryCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { contentViewBatchSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/views — batched view telemetry
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: contentViewBatchSchema,
      label: "POST /content/views",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) =>
      ingestContentViewsCore(svc, userId, data, { ip }),
  );
}
