"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { updateContentPostCore } from "@abonten/services/content/contentPostCore";
import { updateContentPostSchema } from "@abonten/validation/contentSchemas";

/** Edits caption, hashtags, attachments (drafts) and switches of an own post. */
export const updateContentPost = withActionLocale(
  async function updateContentPost(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(updateContentPostSchema, input);
    if (parsed.error) return parsed.error;
    // Posting as the team the person manages as (stage 4c).
    const actor = await actingFor(caller.userId, "content.post");
    if (actor.error) return actor.error;
    return updateContentPostCore(caller.svc, actor.accountId, parsed.data);
  },
);
