"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { contentPublisherFor } from "@/utils/teamActor";
import { listContentCommentsCore } from "@abonten/services/content/contentEngagementCore";
import { contentCommentsRequestSchema } from "@abonten/validation/contentSchemas";

/** A page of comments (or replies to one comment). */
export const listContentComments = withActionLocale(
  async function listContentComments(input: unknown) {
    const caller = await resolveContentCaller();
    const parsed = parseContentInput(contentCommentsRequestSchema, input);
    if (parsed.error) return parsed.error;
    // Comments on the team's post: the members who post for it may remove
    // them (stage 4c).
    const publisher = caller.userId
      ? await contentPublisherFor(caller.userId)
      : null;
    return listContentCommentsCore(
      caller.svc,
      caller.userId,
      parsed.data,
      publisher && !publisher.blocked ? publisher.accountId : null,
    );
  },
);
