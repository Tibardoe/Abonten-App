import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { recordContentShareCore } from "@abonten/services/content/contentEngagementCore";
import { contentShareSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/share — count a share
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: contentShareSchema,
      label: "POST /content/share",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) => recordContentShareCore(svc, userId, data),
  );
}
