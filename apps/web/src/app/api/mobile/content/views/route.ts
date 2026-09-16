import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { ingestContentViewsCore } from "@abonten/services/content/contentTelemetryCore";
import { contentViewBatchSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/views — batched view telemetry
export async function POST(req: Request) {
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
