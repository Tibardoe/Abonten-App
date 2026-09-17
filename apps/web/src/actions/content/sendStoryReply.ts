"use server";

import { createClient } from "@/config/supabase/server";
import { parseContentInput, requireContentUser } from "@/utils/contentAction";
import { logger } from "@abonten/core/logger";
import { sendStoryReplyCore } from "@abonten/services/content/storyReplyCore";
import { storyReplySchema } from "@abonten/validation/contentSchemas";

/**
 * A private reply or reaction to a Story, sent from the Story viewer into
 * the viewer's conversation with the publisher. The programme check and the
 * Story's own reaction use the service role; the message itself goes
 * through send_story_reply on the caller's session (auth.uid() is the
 * sender). Shares its body with POST /api/mobile/content/stories/reply.
 */
export async function sendStoryReply(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(storyReplySchema, input);
  if (parsed.error) return parsed.error;
  try {
    const supabase = await createClient();
    return await sendStoryReplyCore(caller.svc, supabase, caller.userId, {
      postId: parsed.data.postId,
      kind: parsed.data.kind,
      content: parsed.data.content,
      clientGeneratedId: parsed.data.clientGeneratedId ?? null,
    });
  } catch (error) {
    logger.error("sendStoryReply failed", error);
    return { status: 500, message: "Something went wrong. Please try again." };
  }
}
