import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { getWeeklyTeaserCore } from "@abonten/services/weekly/weeklyEditionCore";
import { weeklyTeaserRequestSchema } from "@abonten/validation/weeklySchemas";

// GET /api/mobile/weekly/teaser?lat=&lng=
// The Explore teaser card for the app, or data: null when there is nothing to
// show this visitor. Never cached: it depends on the caller and location.
export async function GET(req: Request) {
  const res = await discoveryRoute(
    req,
    {
      schema: weeklyTeaserRequestSchema,
      label: "GET /weekly/teaser",
      allowAnonymous: true,
    },
    ({ svc, userId, data }) => getWeeklyTeaserCore(svc, userId, data),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
