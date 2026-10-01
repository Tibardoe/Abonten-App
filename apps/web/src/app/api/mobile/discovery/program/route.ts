import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { getDiscoveryProgramCore } from "@abonten/services/search/discoveryProgram";
import { z } from "zod";

// GET /api/mobile/discovery/program
// Which Discovery features the caller may use (new search, organizer and
// place search, alerts and prompts). Ships all-off; fails closed.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /discovery/program",
      allowAnonymous: true,
    },
    ({ svc, userId }) => getDiscoveryProgramCore(svc, userId),
  );
}
