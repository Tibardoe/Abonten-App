import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { setContentSaveCore } from "@abonten/services/content/contentEngagementCore";
import { contentSaveSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/save — save / unsave
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    { schema: contentSaveSchema, label: "POST /content/save" },
    ({ svc, userId, data, ip }) =>
      setContentSaveCore(svc, signedIn(userId), data),
  );
}
