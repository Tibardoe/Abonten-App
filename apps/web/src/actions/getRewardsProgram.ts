"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { getRewardsProgramCore } from "@abonten/services/rewards/rewardsProgramQuery";

/**
 * Whether Abonten Rewards is switched on for the current visitor, and the
 * active reward terms for "How to earn" copy. Works signed out too.
 */
export const getRewardsProgram = withActionLocale(
  async function getRewardsProgram() {
    const supabase = await createClient();
    return getRewardsProgramCore(supabase);
  },
);
