"use server";

import { createClient } from "@/config/supabase/server";
import { getRewardEmailPreferenceCore } from "@abonten/services/notifications/rewardEmailPreferenceCore";
import type { RewardEmailPreference } from "@abonten/types/rewards";

/**
 * Whether the signed-in user gets Abonten Rewards emails. Same service as
 * GET /api/mobile/notifications/reward-emails.
 */
export async function getRewardEmailPreference(): Promise<{
  status: number;
  message?: string;
  data?: RewardEmailPreference;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };

  return getRewardEmailPreferenceCore(user.id);
}
