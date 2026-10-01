"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireContentUser } from "@/utils/contentAction";
import { getPromotionOptionsCore } from "@abonten/services/content/campaigns/contentPromotionCore";

/** Budget range, suggested budgets and run lengths for a promotion. */
export const getPromotionOptions = withActionLocale(
  async function getPromotionOptions() {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    return getPromotionOptionsCore(caller.svc, caller.userId);
  },
);
