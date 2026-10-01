"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getRewardEmailPreferenceCore } from "@abonten/services/notifications/rewardEmailPreferenceCore";
import type { RewardEmailPreference } from "@abonten/types/rewards";

/**
 * Whether the signed-in user gets Abonten Rewards emails. Same service as
 * GET /api/mobile/notifications/reward-emails.
 */
export const getRewardEmailPreference = withActionLocale(
  async function getRewardEmailPreference(): Promise<{
    status: number;
    message?: string;
    data?: RewardEmailPreference;
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotLoggedIn") };

    return getRewardEmailPreferenceCore(user.id);
  },
);
