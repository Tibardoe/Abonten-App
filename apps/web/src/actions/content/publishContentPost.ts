"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { publishContentPostCore } from "@abonten/services/content/contentPostCore";
import { contentPostIdSchema } from "@abonten/validation/contentSchemas";

/** Publishes an own draft. */
export async function publishContentPost(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(contentPostIdSchema, input);
  if (parsed.error) return parsed.error;
  return publishContentPostCore(caller.svc, caller.userId, parsed.data.postId);
}
