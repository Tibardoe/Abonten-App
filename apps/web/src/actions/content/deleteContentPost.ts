"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { deleteContentPostCore } from "@abonten/services/content/contentPostCore";
import { contentPostIdSchema } from "@abonten/validation/contentSchemas";

/** Soft-deletes an own post (kept for the retention period). */
export const deleteContentPost = withActionLocale(
  async function deleteContentPost(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(contentPostIdSchema, input);
    if (parsed.error) return parsed.error;
    // Posting as the team the person manages as (stage 4c).
    const actor = await actingFor(caller.userId, "content.post");
    if (actor.error) return actor.error;
    return deleteContentPostCore(
      caller.svc,
      actor.accountId,
      parsed.data.postId,
    );
  },
);
