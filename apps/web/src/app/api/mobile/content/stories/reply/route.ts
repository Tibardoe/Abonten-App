import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { sendStoryReplyCore } from "@abonten/services/content/storyReplyCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { storyReplySchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/stories/reply
//   { postId, kind: "text" | "reaction", content, clientGeneratedId? }
// A private reply or reaction to a Story. It is sent as a message in the
// viewer's conversation with the publisher (the RPC runs on the caller's
// session so auth.uid() is the sender); the programme check and the Story's
// own reaction use the service role, like the other content routes.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = storyReplySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? "Invalid reply.",
      });
    }
    return apiJson(
      await sendStoryReplyCore(
        getSupabaseServiceClient(),
        auth.supabase,
        auth.user.id,
        {
          postId: parsed.data.postId,
          kind: parsed.data.kind,
          content: parsed.data.content,
          clientGeneratedId: parsed.data.clientGeneratedId ?? null,
        },
      ),
    );
  } catch (error) {
    logger.error("mobile POST /content/stories/reply failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
