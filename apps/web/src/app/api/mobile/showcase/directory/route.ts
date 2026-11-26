import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { getShowcaseDirectoryCore } from "@abonten/services/showcase/showcaseWallCore";
import { showcaseWallRequestSchema } from "@abonten/validation/showcaseSchemas";

// GET /api/mobile/showcase/directory?lat=&lng=
// "See all" of the "On Abonten" wall: every host and place that shows on
// it, in two groups. 404 while it is not on for this caller. Never cached.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const res = await discoveryRoute(
    req,
    {
      schema: showcaseWallRequestSchema,
      label: "GET /showcase/directory",
      allowAnonymous: true,
    },
    ({ svc, userId, data }) => getShowcaseDirectoryCore(svc, userId, data),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
