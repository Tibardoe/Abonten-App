"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { advertiserCampaignActionCore } from "@abonten/services/content/campaigns/contentCampaignCore";
import { advertiserCampaignActionSchema } from "@abonten/validation/contentSchemas";

/** Pause, resume or cancel an own campaign. */
export async function advertiserCampaignAction(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(advertiserCampaignActionSchema, input);
  if (parsed.error) return parsed.error;
  return advertiserCampaignActionCore(caller.svc, caller.userId, parsed.data);
}
