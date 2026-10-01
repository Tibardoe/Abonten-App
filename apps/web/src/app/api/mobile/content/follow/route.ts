import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  getFollowStatusCore,
  setFollowCore,
} from "@abonten/services/content/followCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import {
  followSchema,
  followStatusSchema,
} from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/follow — follow status + follower count
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: followStatusSchema,
      label: "GET /content/follow",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) => getFollowStatusCore(svc, userId, data),
  );
}

// POST /api/mobile/content/follow — follow / unfollow
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: followSchema, label: "POST /content/follow" },
    ({ svc, userId, data, ip }) => setFollowCore(svc, signedIn(userId), data),
  );
}
