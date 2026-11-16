"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireContentUser } from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { listAttachableEventsCore } from "@abonten/services/content/contentAttachCore";

/** Events the caller may attach to a Spotlight or Story. */
export const listAttachableEvents = withActionLocale(
  async function listAttachableEvents() {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    // Posting as the team the person manages as (stage 4c).
    const actor = await actingFor(caller.userId, "content.post");
    if (actor.error) return actor.error;
    return listAttachableEventsCore(caller.svc, actor.accountId);
  },
);
