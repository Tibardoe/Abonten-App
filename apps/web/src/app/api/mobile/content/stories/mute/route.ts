import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { setStoryMuteCore } from "@abonten/services/content/storiesCore";
import { contentMuteSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/stories/mute — mute / unmute a publisher's Stories
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    { schema: contentMuteSchema, label: "POST /content/stories/mute" },
    ({ svc, userId, data, ip }) =>
      setStoryMuteCore(svc, signedIn(userId), data),
  );
}
