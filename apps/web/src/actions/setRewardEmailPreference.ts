"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { setRewardEmailPreferenceCore } from "@abonten/services/notifications/rewardEmailPreferenceCore";
import type { RewardEmailPreference } from "@abonten/types/rewards";

/**
 * Turns the signed-in user's Abonten Rewards emails on or off. Same service
 * as PUT /api/mobile/notifications/reward-emails.
 */
export const setRewardEmailPreference = withActionLocale(
  async function setRewardEmailPreference(input: {
    enabled: boolean;
  }): Promise<{
    status: number;
    message?: string;
    data?: RewardEmailPreference;
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotLoggedIn") };

    return setRewardEmailPreferenceCore(user.id, { enabled: input?.enabled });
  },
);
