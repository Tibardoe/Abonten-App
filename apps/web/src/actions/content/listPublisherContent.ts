"use server";

import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { listPublisherPostsCore } from "@abonten/services/content/contentPostCore";
import { publisherPostsRequestSchema } from "@abonten/validation/contentSchemas";

/** Public posts of one organizer or place. */
export async function listPublisherContent(input: unknown) {
  const caller = await resolveContentCaller();
  const parsed = parseContentInput(publisherPostsRequestSchema, input);
  if (parsed.error) return parsed.error;
  return listPublisherPostsCore(caller.svc, caller.userId, parsed.data);
}
