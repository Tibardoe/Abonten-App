"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { setFollowCore } from "@abonten/services/content/followCore";
import { followSchema } from "@abonten/validation/contentSchemas";

/** Follow / unfollow an organizer or place. */
export async function setFollow(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(followSchema, input);
  if (parsed.error) return parsed.error;
  return setFollowCore(caller.svc, caller.userId, parsed.data);
}
