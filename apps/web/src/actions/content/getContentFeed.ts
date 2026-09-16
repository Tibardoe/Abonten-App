"use server";

import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { getContentFeedCore } from "@abonten/services/content/contentFeedCore";
import { contentFeedRequestSchema } from "@abonten/validation/contentSchemas";

/** One page of a Spotlight surface for the visitor. */
export async function getContentFeed(input: unknown) {
  const caller = await resolveContentCaller();
  const parsed = parseContentInput(contentFeedRequestSchema, input);
  if (parsed.error) return parsed.error;
  return getContentFeedCore(caller.svc, caller.userId, parsed.data, {
    ip: await contentRequestIp(),
  });
}
