import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { registerContentMediaCore } from "@abonten/services/content/contentMediaCore";
import { registerContentMediaSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/media — register a direct Cloudinary upload
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    { schema: registerContentMediaSchema, label: "POST /content/media" },
    ({ svc, userId, data, ip }) =>
      registerContentMediaCore(svc, signedIn(userId), data),
  );
}
