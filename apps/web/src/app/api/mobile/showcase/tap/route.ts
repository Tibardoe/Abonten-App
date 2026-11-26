import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { recordShowcaseTapCore } from "@abonten/services/showcase/showcaseWallCore";
import { showcaseTapSchema } from "@abonten/validation/showcaseSchemas";

// POST /api/mobile/showcase/tap { entryId }
// Count a tap on an "On Abonten" tile (the app opens the page by itself).
// Counting never gets in the way: 200 unless the caller is going too fast.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: showcaseTapSchema,
      label: "POST /showcase/tap",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) =>
      recordShowcaseTapCore(svc, userId, data, { ip }),
  );
}
