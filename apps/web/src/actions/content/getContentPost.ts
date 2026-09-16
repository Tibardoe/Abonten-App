"use server";

import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { getContentPostCore } from "@abonten/services/content/contentPostCore";
import { contentPostIdSchema } from "@abonten/validation/contentSchemas";

/** One Spotlight or Story by id; 410 with the publisher when a Story has ended. */
export async function getContentPost(input: unknown) {
  const caller = await resolveContentCaller();
  const parsed = parseContentInput(contentPostIdSchema, input);
  if (parsed.error) return parsed.error;
  return getContentPostCore(caller.svc, caller.userId, parsed.data.postId);
}
