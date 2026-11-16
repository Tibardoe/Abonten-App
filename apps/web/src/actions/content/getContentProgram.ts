"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { resolveContentCaller } from "@/utils/contentAction";
import { contentPublisherFor } from "@/utils/teamActor";
import { getContentProgramCore } from "@abonten/services/content/contentProgram";
import { DISABLED_CONTENT_PROGRAM } from "@abonten/types/contentType";

/** What the current visitor may use of Spotlight + Stories. Fails closed. */
export const getContentProgram = withActionLocale(
  async function getContentProgram() {
    const caller = await resolveContentCaller();
    try {
      // Posting as the team the person manages as (stage 4c), when their
      // role covers it; off while it does not.
      const publisher = caller.userId
        ? await contentPublisherFor(caller.userId)
        : null;
      return await getContentProgramCore(caller.svc, caller.userId, {
        publisherId: publisher?.accountId ?? null,
        blocked: publisher?.blocked ?? false,
        canPromote: publisher?.canPromote ?? false,
      });
    } catch {
      return { status: 200, data: DISABLED_CONTENT_PROGRAM };
    }
  },
);
