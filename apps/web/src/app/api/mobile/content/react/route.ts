import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { setContentReactionCore } from "@abonten/services/content/contentEngagementCore";
import type { ContentReactionEmoji } from "@abonten/types/contentType";
import { contentReactSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/react — set / change / remove a Story reaction
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    { schema: contentReactSchema, label: "POST /content/react" },
    ({ svc, userId, data, ip }) =>
      setContentReactionCore(svc, signedIn(userId), {
        postId: data.postId,
        emoji: data.emoji as ContentReactionEmoji | null,
      }),
  );
}
