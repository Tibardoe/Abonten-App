"use server";

import { createClient } from "@/config/supabase/server";
import { getCreditSummaryCore } from "@abonten/services/rewards/creditsQuery";
import type { CreditSummary } from "@abonten/types/rewards";

/**
 * The signed-in user's Abonten Credit balance (available, pending, on hold,
 * lifetime totals) and whether the Rewards program is switched on for them.
 * Same service as GET /api/mobile/rewards/summary.
 */
export async function getCreditSummary(): Promise<{
  status: number;
  message?: string;
  data?: CreditSummary;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return getCreditSummaryCore(supabase, user.id);
}
