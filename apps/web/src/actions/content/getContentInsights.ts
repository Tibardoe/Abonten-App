"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { getContentInsightsCore } from "@abonten/services/content/contentTelemetryCore";
import { contentInsightsRequestSchema } from "@abonten/validation/contentSchemas";

/** The owner's analytics for one post. */
export async function getContentInsights(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(contentInsightsRequestSchema, input);
  if (parsed.error) return parsed.error;
  return getContentInsightsCore(caller.svc, caller.userId, parsed.data);
}
