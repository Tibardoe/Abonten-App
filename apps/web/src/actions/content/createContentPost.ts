"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { createContentPostCore } from "@abonten/services/content/contentPostCore";
import { createContentPostSchema } from "@abonten/validation/contentSchemas";

/** Creates (and by default publishes) a Spotlight or Story. */
export const createContentPost = withActionLocale(
  async function createContentPost(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(createContentPostSchema, input);
    if (parsed.error) return parsed.error;
    // Posting as the team the person manages as (stage 4c).
    const actor = await actingFor(caller.userId, "content.post");
    if (actor.error) return actor.error;
    return createContentPostCore(
      caller.svc,
      caller.userId,
      parsed.data,
      actor.accountId,
    );
  },
);
