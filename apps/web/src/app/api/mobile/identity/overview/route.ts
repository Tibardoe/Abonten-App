import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { getIdentityOverviewCore } from "@abonten/services/identity/identityCore";
import { z } from "zod";

// GET /api/mobile/identity/overview
// The whole identity screen in one call, including whether the programme
// is open to this account.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const res = await discoveryRoute(
    req,
    { schema: z.object({}).passthrough(), label: "GET /identity/overview" },
    ({ svc, userId }) => getIdentityOverviewCore(svc, signedIn(userId)),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
