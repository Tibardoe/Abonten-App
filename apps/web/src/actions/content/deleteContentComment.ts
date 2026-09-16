"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { deleteContentCommentCore } from "@abonten/services/content/contentEngagementCore";
import { contentCommentIdSchema } from "@abonten/validation/contentSchemas";

/** Removes an own comment, or any comment on an own post. */
export async function deleteContentComment(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(contentCommentIdSchema, input);
  if (parsed.error) return parsed.error;
  return deleteContentCommentCore(
    caller.svc,
    caller.userId,
    parsed.data.commentId,
  );
}
