"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { setContentReactionCore } from "@abonten/services/content/contentEngagementCore";
import type { ContentReactionEmoji } from "@abonten/types/contentType";
import { contentReactSchema } from "@abonten/validation/contentSchemas";

/** Set, change or remove the viewer's reaction on a Story. */
export async function setContentReaction(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(contentReactSchema, input);
  if (parsed.error) return parsed.error;
  return setContentReactionCore(caller.svc, caller.userId, {
    postId: parsed.data.postId,
    emoji: parsed.data.emoji as ContentReactionEmoji | null,
  });
}
