import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { getSafetyOverviewCore } from "@abonten/services/safety/safetySessionCore";
import { z } from "zod";

// GET /api/mobile/safety/overview
// The Safety screen: contacts, the open session, history, events, emergency numbers.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const res = await discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /safety/overview",
    },
    ({ svc, userId }) => getSafetyOverviewCore(svc, signedIn(userId)),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
