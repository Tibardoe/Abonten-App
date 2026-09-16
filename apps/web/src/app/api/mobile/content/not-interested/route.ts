import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { setNotInterestedCore } from "@abonten/services/content/contentEngagementCore";
import { contentNotInterestedSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/not-interested — hide a post from the viewer's feeds
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: contentNotInterestedSchema,
      label: "POST /content/not-interested",
    },
    ({ svc, userId, data, ip }) =>
      setNotInterestedCore(svc, signedIn(userId), data),
  );
}
