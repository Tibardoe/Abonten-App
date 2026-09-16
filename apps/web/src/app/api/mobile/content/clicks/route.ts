import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { recordContentClickCore } from "@abonten/services/content/contentTelemetryCore";
import { contentClickSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/clicks — a call-to-action click
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: contentClickSchema,
      label: "POST /content/clicks",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) =>
      recordContentClickCore(svc, userId, data, { ip }),
  );
}
