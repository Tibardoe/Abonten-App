"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { setStoryMuteCore } from "@abonten/services/content/storiesCore";
import { contentMuteSchema } from "@abonten/validation/contentSchemas";

/** Mute / unmute a publisher's Stories (Stories only). */
export async function setStoryMute(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(contentMuteSchema, input);
  if (parsed.error) return parsed.error;
  return setStoryMuteCore(caller.svc, caller.userId, parsed.data);
}
