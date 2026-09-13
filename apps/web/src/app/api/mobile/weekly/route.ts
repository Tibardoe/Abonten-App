import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { getWeeklyEditionCore } from "@abonten/services/weekly/weeklyEditionCore";
import { weeklyEditionRequestSchema } from "@abonten/validation/weeklySchemas";

// GET /api/mobile/weekly?scope=&week=&lat=&lng=
// The Abonten Weekly edition for the app. Works signed out. The response may
// be cached by a CDN only when it is the same for everyone (the programme is
// open to all or closed to all); while it is open to staff or beta testers it
// depends on the Bearer token and is marked private.
export async function GET(req: Request) {
  const seen: { visibility: "public" | "personal" } = {
    visibility: "personal",
  };
  const res = await discoveryRoute(
    req,
    {
      schema: weeklyEditionRequestSchema,
      label: "GET /weekly",
      allowAnonymous: true,
    },
    async ({ svc, userId, data }) => {
      const result = await getWeeklyEditionCore(svc, userId, data);
      seen.visibility = result.data?.visibility ?? "personal";
      return result;
    },
  );
  res.headers.set(
    "Cache-Control",
    seen.visibility === "public" && res.status === 200
      ? "public, s-maxage=60, stale-while-revalidate=300"
      : "private, no-store",
  );
  return res;
}
