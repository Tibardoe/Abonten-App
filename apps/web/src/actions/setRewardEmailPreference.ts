"use server";

import { createClient } from "@/config/supabase/server";
import { setRewardEmailPreferenceCore } from "@abonten/services/notifications/rewardEmailPreferenceCore";
import type { RewardEmailPreference } from "@abonten/types/rewards";

/**
 * Turns the signed-in user's Abonten Rewards emails on or off. Same service
 * as PUT /api/mobile/notifications/reward-emails.
 */
export async function setRewardEmailPreference(input: {
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
  if (!user) return { status: 401, message: "User not logged in" };

  return setRewardEmailPreferenceCore(user.id, { enabled: input?.enabled });
}
