import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { getSafetyProgramCore } from "@abonten/services/safety/safetyProgram";
import { z } from "zod";

// GET /api/mobile/safety/program
// Whether Abonten Safety is on for this caller. Fails closed.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const res = await discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /safety/program",
      allowAnonymous: true,
    },
    ({ svc, userId }) => getSafetyProgramCore(svc, userId),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
