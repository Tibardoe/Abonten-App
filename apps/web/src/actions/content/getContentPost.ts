"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { contentPublisherFor } from "@/utils/teamActor";
import { getContentPostCore } from "@abonten/services/content/contentPostCore";
import { contentPostIdSchema } from "@abonten/validation/contentSchemas";

/** One Spotlight or Story by id; 410 with the publisher when a Story has ended. */
export const getContentPost = withActionLocale(async function getContentPost(
  input: unknown,
) {
  const caller = await resolveContentCaller();
  const parsed = parseContentInput(contentPostIdSchema, input);
  if (parsed.error) return parsed.error;
  // A team's draft or ended Story opens for the members who post for it.
  const publisher = caller.userId
    ? await contentPublisherFor(caller.userId)
    : null;
  return getContentPostCore(
    caller.svc,
    caller.userId,
    parsed.data.postId,
    publisher && !publisher.blocked ? publisher.accountId : null,
  );
});
