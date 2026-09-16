"use server";

import { parseContentInput, requireContentUser } from "@/utils/contentAction";
import { estimateContentPromotionCore } from "@abonten/services/content/campaigns/contentPromotionCore";
import { estimateContentPromotionSchema } from "@abonten/validation/contentSchemas";

/** Server-priced estimated reach for a budget, run length and audience. */
export async function estimateContentPromotion(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(estimateContentPromotionSchema, input);
  if (parsed.error) return parsed.error;
  return estimateContentPromotionCore(caller.svc, caller.userId, parsed.data);
}
