"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { getContentInsightsCore } from "@abonten/services/content/contentTelemetryCore";
import { contentInsightsRequestSchema } from "@abonten/validation/contentSchemas";

/** The owner's analytics for one post. */
export const getContentInsights = withActionLocale(
  async function getContentInsights(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(contentInsightsRequestSchema, input);
    if (parsed.error) return parsed.error;
    // Posting as the team the person manages as (stage 4c).
    const actor = await actingFor(caller.userId, "content.post");
    if (actor.error) return actor.error;
    return getContentInsightsCore(caller.svc, actor.accountId, parsed.data);
  },
);
