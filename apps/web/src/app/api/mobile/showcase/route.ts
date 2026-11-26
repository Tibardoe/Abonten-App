import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { getShowcaseWallCore } from "@abonten/services/showcase/showcaseWallCore";
import { showcaseWallRequestSchema } from "@abonten/validation/showcaseSchemas";

// GET /api/mobile/showcase?lat=&lng=
// The "On Abonten" wall for the app's Explore tab: data null when it is not
// on for this caller or too thin to show. Never cached: the tiles carry the
// caller's own follow state.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const res = await discoveryRoute(
    req,
    {
      schema: showcaseWallRequestSchema,
      label: "GET /showcase",
      allowAnonymous: true,
    },
    ({ svc, userId, data }) => getShowcaseWallCore(svc, userId, data),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
