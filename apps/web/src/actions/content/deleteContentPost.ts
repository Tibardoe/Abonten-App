"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { deleteContentPostCore } from "@abonten/services/content/contentPostCore";
import { contentPostIdSchema } from "@abonten/validation/contentSchemas";

/** Soft-deletes an own post (kept for the retention period). */
export async function deleteContentPost(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(contentPostIdSchema, input);
  if (parsed.error) return parsed.error;
  return deleteContentPostCore(caller.svc, caller.userId, parsed.data.postId);
}
