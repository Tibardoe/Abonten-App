"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { createContentCampaignCore } from "@abonten/services/content/campaigns/contentCampaignCore";
import { createContentCampaignSchema } from "@abonten/validation/contentSchemas";

/** Starts a promoted Spotlight campaign and its checkout. */
export async function createContentCampaign(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(createContentCampaignSchema, input);
  if (parsed.error) return parsed.error;
  return createContentCampaignCore(caller.svc, caller.userId, parsed.data);
}
