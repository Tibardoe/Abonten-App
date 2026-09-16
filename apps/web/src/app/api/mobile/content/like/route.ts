import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { setContentLikeCore } from "@abonten/services/content/contentEngagementCore";
import { contentLikeSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/like — like / unlike
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    { schema: contentLikeSchema, label: "POST /content/like" },
    ({ svc, userId, data, ip }) =>
      setContentLikeCore(svc, signedIn(userId), data),
  );
}
