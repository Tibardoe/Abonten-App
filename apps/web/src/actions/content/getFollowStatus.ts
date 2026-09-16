"use server";

import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { getFollowStatusCore } from "@abonten/services/content/followCore";
import { followStatusSchema } from "@abonten/validation/contentSchemas";

/** Whether the viewer follows an organizer or place, and its follower count. */
export async function getFollowStatus(input: unknown) {
  const caller = await resolveContentCaller();
  const parsed = parseContentInput(followStatusSchema, input);
  if (parsed.error) return parsed.error;
  return getFollowStatusCore(caller.svc, caller.userId, parsed.data);
}
