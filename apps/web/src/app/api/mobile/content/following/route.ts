import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { listFollowingCore } from "@abonten/services/content/followCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { z } from "zod";

// GET /api/mobile/content/following — everything the caller follows
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: z.object({}).passthrough(), label: "GET /content/following" },
    ({ svc, userId, data, ip }) => listFollowingCore(svc, signedIn(userId)),
  );
}
