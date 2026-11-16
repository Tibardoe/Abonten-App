"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { publishContentPostCore } from "@abonten/services/content/contentPostCore";
import { contentPostIdSchema } from "@abonten/validation/contentSchemas";

/** Publishes an own draft. */
export const publishContentPost = withActionLocale(
  async function publishContentPost(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(contentPostIdSchema, input);
    if (parsed.error) return parsed.error;
    // Posting as the team the person manages as (stage 4c).
    const actor = await actingFor(caller.userId, "content.post");
    if (actor.error) return actor.error;
    return publishContentPostCore(
      caller.svc,
      actor.accountId,
      parsed.data.postId,
      caller.userId,
    );
  },
);
