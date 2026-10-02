"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { searchSpotlightCore } from "@abonten/services/content/contentFeedCore";
import { contentSearchRequestSchema } from "@abonten/validation/contentSchemas";

/** Spotlight posts matching a caption or hashtag query. */
export const searchSpotlight = withActionLocale(async function searchSpotlight(
  input: unknown,
) {
  const caller = await resolveContentCaller();
  const parsed = parseContentInput(contentSearchRequestSchema, input);
  if (parsed.error) return parsed.error;
  return searchSpotlightCore(caller.svc, caller.userId, parsed.data.q);
});
