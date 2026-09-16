"use server";

import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { recordContentShareCore } from "@abonten/services/content/contentEngagementCore";
import { contentShareSchema } from "@abonten/validation/contentSchemas";

/** Counts a share (signed in or not). */
export async function recordContentShare(input: unknown) {
  const caller = await resolveContentCaller();
  const parsed = parseContentInput(contentShareSchema, input);
  if (parsed.error) return parsed.error;
  return recordContentShareCore(caller.svc, caller.userId, parsed.data, {
    ip: await contentRequestIp(),
  });
}
