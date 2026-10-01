import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { setContentSaveCore } from "@abonten/services/content/contentEngagementCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { contentSaveSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/save — save / unsave
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: contentSaveSchema, label: "POST /content/save" },
    ({ svc, userId, data, ip }) =>
      setContentSaveCore(svc, signedIn(userId), data),
  );
}
