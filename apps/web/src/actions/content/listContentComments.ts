"use server";

import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { listContentCommentsCore } from "@abonten/services/content/contentEngagementCore";
import { contentCommentsRequestSchema } from "@abonten/validation/contentSchemas";

/** A page of comments (or replies to one comment). */
export async function listContentComments(input: unknown) {
  const caller = await resolveContentCaller();
  const parsed = parseContentInput(contentCommentsRequestSchema, input);
  if (parsed.error) return parsed.error;
  return listContentCommentsCore(caller.svc, caller.userId, parsed.data);
}
