"use server";

import { createClient } from "@/config/supabase/server";
import { getRewardsProgramCore } from "@abonten/services/rewards/rewardsProgramQuery";

/**
 * Whether Abonten Rewards is switched on for the current visitor, and the
 * active reward terms for "How to earn" copy. Works signed out too.
 */
export async function getRewardsProgram() {
  const supabase = await createClient();
  return getRewardsProgramCore(supabase);
}
