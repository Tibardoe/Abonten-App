"use server";

import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { getStorySequenceCore } from "@abonten/services/content/storiesCore";
import { storySequenceRequestSchema } from "@abonten/validation/contentSchemas";

/** One publisher's active Stories for the viewer. */
export async function getStorySequence(input: unknown) {
  const caller = await resolveContentCaller();
  const parsed = parseContentInput(storySequenceRequestSchema, input);
  if (parsed.error) return parsed.error;
  return getStorySequenceCore(caller.svc, caller.userId, parsed.data);
}
