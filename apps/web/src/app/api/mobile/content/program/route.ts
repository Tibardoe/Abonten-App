import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { getContentProgramCore } from "@abonten/services/content/contentProgram";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { z } from "zod";

// GET /api/mobile/content/program — what the caller may use (works signed out)
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /content/program",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) => getContentProgramCore(svc, userId),
  );
}
