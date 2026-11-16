"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { contentPublisherFor } from "@/utils/teamActor";
import { deleteContentCommentCore } from "@abonten/services/content/contentEngagementCore";
import { contentCommentIdSchema } from "@abonten/validation/contentSchemas";

/** Removes an own comment, or any comment on an own post. */
export const deleteContentComment = withActionLocale(
  async function deleteContentComment(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(contentCommentIdSchema, input);
    if (parsed.error) return parsed.error;
    // A comment on the team's post: the members who post for it.
    const publisher = await contentPublisherFor(caller.userId);
    return deleteContentCommentCore(
      caller.svc,
      caller.userId,
      parsed.data.commentId,
      publisher.blocked ? null : publisher.accountId,
    );
  },
);
