"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { getContentCampaignCheckoutCore } from "@abonten/services/content/campaigns/contentCampaignCore";
import { checkoutIdSchema } from "@abonten/validation/contentSchemas";

/** A campaign checkout for the web checkout page. */
export async function getContentCampaignCheckout(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(checkoutIdSchema, input);
  if (parsed.error) return parsed.error;
  return getContentCampaignCheckoutCore(
    caller.svc,
    caller.userId,
    parsed.data.checkoutId,
  );
}
