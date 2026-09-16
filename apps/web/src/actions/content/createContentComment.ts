"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { createContentCommentCore } from "@abonten/services/content/contentEngagementCore";
import { createContentCommentSchema } from "@abonten/validation/contentSchemas";

/** Adds a comment or a reply. */
export async function createContentComment(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(createContentCommentSchema, input);
  if (parsed.error) return parsed.error;
  return createContentCommentCore(caller.svc, caller.userId, parsed.data);
}
